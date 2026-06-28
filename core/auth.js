// Google Identity Services (GIS) によるアクセストークン取得（ブラウザ専用・シークレット不要）。
let tokenClient = null;
let accessToken = null;
let tokenExp = 0;

export function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('GISスクリプトの読み込みに失敗しました'));
    document.head.appendChild(s);
  });
}

export async function initAuth(clientId, scope) {
  await loadGis();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope,
    callback: () => {}, // requestToken で都度差し替える
  });
}

// prompt:'' = サイレント（同意済みなら画面なし） / 'consent' = 同意画面を強制
export function requestToken({ prompt = '' } = {}) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error('initAuth が未実行です'));
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error + (resp.error_description ? ': ' + resp.error_description : '')));
      accessToken = resp.access_token;
      tokenExp = Date.now() + ((resp.expires_in || 3600) * 1000) - 60000; // 1分の余裕
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt });
  });
}

// 有効なトークンを返す。期限切れ/未取得ならサイレント再取得。
export async function getToken() {
  if (accessToken && Date.now() < tokenExp) return accessToken;
  return requestToken({ prompt: '' });
}

export function hasToken() { return !!accessToken && Date.now() < tokenExp; }
export function signOut() { accessToken = null; tokenExp = 0; }
