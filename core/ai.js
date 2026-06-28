// Claude API（ブラウザ直叩き）で教材を解析する。APIキーは親端末ローカルのみ（Driveには出さない）。
// images は [{base64, mediaType}] の配列。呼び出し側が Drive から読み込んで渡す。

const API_URL = 'https://api.anthropic.com/v1/messages';

async function claudeVision(content, schema, { apiKey, model = 'claude-haiku-4-5', maxTokens = 4000 }) {
  if (!apiKey) throw new Error('Claude APIキーが未設定です');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema } },
    }),
  });
  if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const j = await res.json();
  const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(txt);
}

function imgBlock(img) {
  return { type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 } };
}

// JSONスキーマで縛らず、モデルに考えさせてから JSON を出させる（難しい視覚読み取り用）。
export function parseJsonBlock(txt) {
  let m = txt.match(/```json\s*([\s\S]*?)```/i) || txt.match(/```\s*([\s\S]*?)```/);
  let s = m ? m[1] : txt;
  if (!m) { const a = s.indexOf('{'); const b = s.lastIndexOf('}'); if (a >= 0 && b > a) s = s.slice(a, b + 1); }
  return JSON.parse(s.trim());
}
async function claudeReasoned(content, { apiKey, model = 'claude-sonnet-4-6', maxTokens = 4000 }) {
  if (!apiKey) throw new Error('Claude APIキーが未設定です');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error('API ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const j = await res.json();
  const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return parseJsonBlock(txt);
}

// ===== 問題構造（大問/小問・設問・本文根拠） =====
export const STRUCT_SCHEMA = { type:'object',additionalProperties:false,required:['pages'],properties:{pages:{type:'array',items:{type:'object',additionalProperties:false,required:['index','skip','honbun','daimons'],properties:{index:{type:'integer'},skip:{type:'boolean'},honbun:{type:'boolean'},daimons:{type:'array',items:{type:'object',additionalProperties:false,required:['label','category','tags','subs'],properties:{label:{type:'string'},category:{type:'string',enum:['数と計算','図形','量と測定','数量関係','文章題','読解','記述','その他']},tags:{type:'array',items:{type:'string'}},subs:{type:'array',items:{type:'object',additionalProperties:false,required:['label','question','evidence'],properties:{label:{type:'string'},question:{type:'string'},evidence:{type:'string'}}}}}}}}}}}};

export async function detectStructure(images, opts) {
  const content = [{ type:'text', text:'小学生用ワークのページ画像です。ページ順に示します。' }];
  images.forEach((im, i) => { content.push({ type:'text', text:'ページ'+(i+1) }); content.push(imgBlock(im)); });
  content.push({ type:'text', text:'各ページについて、子どもが自分で解く「大問」（問1・問2…や 1,2,3）を順に挙げ、各大問の中の小問（(1)(2)…や ①②、または とい1・とい2 など）を列挙してください。各小問は label=番号、question=設問の文（短く要約可）、evidence=本文の中でその設問の答えの手がかりになる箇所をそのまま短く抜き出し（読解で本文がある場合のみ。無ければ空文字）。小問が分かれていなければ subs は空配列。\n【重要】「れいだい／例題／れい／見本／やってみよう（解き方の説明）／解説」など、答えや解き方が最初から示されていて“子どもが解く問題ではない”ものは daimons に含めないでください（そのページに解く問題が他に無ければ skip=true）。空の大問・空の小問は作らないこと。\n表紙・目次・奥付・解答・白紙は skip=true・daimons=[]。国語の長文など、設問の前提となる「本文（読む文章）が主のページ」は honbun=true（設問ページは false）。各大問に教科カテゴリと1〜3個の日本語スキルタグ。index には示したページ番号を入れてください。' });
  content.push({ type:'text', text:
`まず各ページを見て、子どもが解く大問・小問を一つずつ数え（例題・解説・見本は除く）、考えてから出力してください。最後に必ず次の形式のJSONだけを \`\`\`json と \`\`\` で囲って出力：
{"pages":[{"index":1,"skip":false,"honbun":false,"daimons":[{"label":"問1","category":"数と計算","tags":["…"],"subs":[{"label":"(1)","question":"…","evidence":""}]}]}]}` });
  const out = await claudeReasoned(content, { ...opts, maxTokens: 5000 });
  return out.pages || [];
}

// ===== 解答の読み取り =====
export const ANS_SCHEMA = { type:'object',additionalProperties:false,required:['answers'],properties:{answers:{type:'array',items:{type:'object',additionalProperties:false,required:['daimon','sub','answer','kind','confidence','page','box','points'],properties:{daimon:{type:'integer'},sub:{type:'integer'},answer:{type:'string'},kind:{type:'string',enum:['value','figure','writing']},confidence:{type:'number'},page:{type:'integer'},points:{type:'array',items:{type:'string'}},box:{type:'object',additionalProperties:false,required:['x','y','w','h'],properties:{x:{type:'number'},y:{type:'number'},w:{type:'number'},h:{type:'number'}}}}}}}};

// unitList: [{name, items:[{label}]}] / images: この束の解答ページ画像。answers[] を返す（page は束内1始まり）。
// 解答ページ画像（この呼び出しでは1ページ推奨）から、各小問の正解を「考えてから」読み取る。
export async function extractAnswers(unitList, images, opts) {
  const list = unitList.map((u, di) => `大問${di+1}「${u.name}」: ` + ((u.items||[]).map((it, si) => `小問${si+1}(${it.label||''})`).join(' ') || '小問1')).join('\n');
  const content = [{ type:'text', text:'これは小学生ワークの「解答（別冊・指導書）」ページ画像です。次の問題構成の、各小問の正解を読み取ります。\n\n問題構成：\n' + list }];
  images.forEach((im, i) => { content.push({ type:'text', text:'解答ページ' + (i+1) }); content.push(imgBlock(im)); });
  content.push({ type:'text', text:
`次の手順で“一つずつ”正確に読み取ってください（急がない）：
1) このページにある大問・小問を見つけ、答えを1問ずつ確認する。
2) 「線でむすぶ」問題は、左の項目から線を1本ずつ終点まで指でなぞるように追い、対応を確定する。交差していても推測で決めない。読み方と数字（例 ろく=6, に=2, く=9, ご=5）の整合も使って確かめる。
3) 数字・記号・語句で1つに定まる答えは kind="value"（answer にその値）。絵・線・○など絵で答えるものは kind="figure"。文章記述は kind="writing"（answer に解答例、points に採点の要点2〜4個）。
4) 確実に読めない答えは confidence を 0.4 以下にし、無理に埋めない。

まず思考を書いてよい。最後に必ず、次の形式のJSONだけを \`\`\`json と \`\`\` で囲って出力：
{"answers":[{"daimon":1,"sub":1,"answer":"…","kind":"value","confidence":0.95,"page":0,"box":{"x":0,"y":0,"w":0,"h":0},"points":[]}]}
figure のとき：page=そのページ番号(1始まり)、box=答えの図の位置(左上0,0〜右下1,1の割合)。value/writing は page=0・box=全0でよい。daimon/sub は上の問題構成の番号。` });
  const out = await claudeReasoned(content, { ...opts, maxTokens: 5000 });
  return out.answers || [];
}
