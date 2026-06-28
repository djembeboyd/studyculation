// PDF・画像ファイルを「ダウンスケールしたJPEG（base64）ページ」に変換する。
// pdf.js はホスト側(parent.html)で読み込み、workerSrc を設定しておくこと（window.pdfjsLib）。

const MAX_EDGE = 1600;   // 長辺の上限px（容量と転送を抑える）
const QUALITY = 0.8;     // JPEG品質

function canvasToJpeg(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  return { base64: dataUrl.split(',')[1], w: canvas.width, h: canvas.height };
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像の読み込みに失敗')); };
    img.src = url;
  });
}

function scaleFor(w, h) {
  return Math.min(1, MAX_EDGE / Math.max(w, h));
}

async function pdfToPages(file, onPage) {
  if (!window.pdfjsLib) throw new Error('pdf.js が読み込まれていません');
  const data = await file.arrayBuffer();
  // CMap は日本語(CJK)フォントの描画に必須。無いと日本語が出ない。
  const pdf = await window.pdfjsLib.getDocument({
    data,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
    cMapPacked: true,
  }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(scaleFor(base.width, base.height) * 2, 2); // 文字の可読性のため最大2倍までは許容
    const vp = page.getViewport({ scale: Math.max(scale, scaleFor(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    pages.push(canvasToJpeg(canvas));
    onPage && onPage();
  }
  return pages;
}

async function imageToPage(file, onPage) {
  const img = await blobToImage(file);
  const s = scaleFor(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * s);
  canvas.height = Math.round(img.naturalHeight * s);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  onPage && onPage();
  return canvasToJpeg(canvas);
}

// files(FileList/array) を順に処理し、[{base64,w,h}] を返す。onPage は1ページ完了ごと。
export async function filesToPages(files, onPage) {
  const out = [];
  for (const file of Array.from(files)) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (isPdf) {
      const pages = await pdfToPages(file, onPage);
      out.push(...pages);
    } else if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
      out.push(await imageToPage(file, onPage));
    }
    // それ以外は無視
  }
  return out;
}
