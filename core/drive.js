// Google Drive REST v3 ラッパー。トークンは auth.js から取得。
import { getToken } from './auth.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function authHeaders(extra = {}) {
  const t = await getToken();
  return { Authorization: 'Bearer ' + t, ...extra };
}

function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

export async function listChildren(folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const url = `${API}/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,size)&pageSize=1000`;
  const r = await fetch(url, { headers: await authHeaders() });
  if (!r.ok) throw new Error('listChildren ' + r.status + ' ' + await r.text());
  return (await r.json()).files || [];
}

export async function findChild(folderId, name) {
  const q = encodeURIComponent(`'${folderId}' in parents and name='${esc(name)}' and trashed=false`);
  const r = await fetch(`${API}/files?q=${q}&fields=files(id,name,mimeType)`, { headers: await authHeaders() });
  if (!r.ok) throw new Error('findChild ' + r.status + ' ' + await r.text());
  return (await r.json()).files?.[0] || null;
}

// folderId 配下に name のフォルダが無ければ作る。ある/作った folder を返す。
export async function ensureFolder(folderId, name) {
  const found = await findChild(folderId, name);
  if (found) return found;
  return createFolder(name, folderId);
}

export async function readText(fileId) {
  const r = await fetch(`${API}/files/${fileId}?alt=media`, { headers: await authHeaders() });
  if (!r.ok) throw new Error('readText ' + r.status + ' ' + await r.text());
  return r.text();
}
export async function readJSON(fileId) { return JSON.parse(await readText(fileId)); }

// 画像などバイナリを base64 文字列で取得（Claude vision に渡す用）。
export async function readBase64(fileId) {
  const r = await fetch(`${API}/files/${fileId}?alt=media`, { headers: await authHeaders() });
  if (!r.ok) throw new Error('readBase64 ' + r.status + ' ' + await r.text());
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export async function createFolder(name, parentId) {
  const meta = { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] };
  const r = await fetch(`${API}/files?fields=id,name,mimeType`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(meta),
  });
  if (!r.ok) throw new Error('createFolder ' + r.status + ' ' + await r.text());
  return r.json();
}

// テキスト/JSON ファイルを新規作成（multipart）。
export async function createFile(name, parentId, content, mimeType = 'application/json') {
  const meta = { name, parents: [parentId] };
  const boundary = '----kodomo' + Math.random().toString(16).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n--${boundary}--`;
  const r = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': `multipart/related; boundary=${boundary}` }),
    body,
  });
  if (!r.ok) throw new Error('createFile ' + r.status + ' ' + await r.text());
  return r.json();
}

// バイナリ（画像など）を base64 で新規アップロード（multipart）。{id,name} を返す。
export async function createBinaryFile(name, parentId, base64, mimeType) {
  const meta = { name, parents: [parentId] };
  const boundary = '----kodomo' + Math.random().toString(16).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;
  const r = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': `multipart/related; boundary=${boundary}` }),
    body,
  });
  if (!r.ok) throw new Error('createBinaryFile ' + r.status + ' ' + await r.text());
  return r.json();
}

// 既存ファイルの中身を上書き（media）。
export async function updateText(fileId, content, mimeType = 'application/json') {
  const r = await fetch(`${UPLOAD}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: await authHeaders({ 'Content-Type': mimeType }),
    body: content,
  });
  if (!r.ok) throw new Error('updateText ' + r.status + ' ' + await r.text());
  return r.json();
}
export async function writeJSON(fileId, obj) { return updateText(fileId, JSON.stringify(obj, null, 2)); }

// name のJSONファイルを folderId 配下から探し、無ければ initial で作って読む。{id, data} を返す。
export async function loadOrInitJSON(folderId, name, initial) {
  let f = await findChild(folderId, name);
  if (!f) f = await createFile(name, folderId, JSON.stringify(initial, null, 2));
  return { id: f.id, data: await readJSON(f.id) };
}
