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

// ===== 問題構造（大問/小問・設問・本文根拠） =====
export const STRUCT_SCHEMA = { type:'object',additionalProperties:false,required:['pages'],properties:{pages:{type:'array',items:{type:'object',additionalProperties:false,required:['index','skip','honbun','daimons'],properties:{index:{type:'integer'},skip:{type:'boolean'},honbun:{type:'boolean'},daimons:{type:'array',items:{type:'object',additionalProperties:false,required:['label','category','tags','subs'],properties:{label:{type:'string'},category:{type:'string',enum:['数と計算','図形','量と測定','数量関係','文章題','読解','記述','その他']},tags:{type:'array',items:{type:'string'}},subs:{type:'array',items:{type:'object',additionalProperties:false,required:['label','question','evidence'],properties:{label:{type:'string'},question:{type:'string'},evidence:{type:'string'}}}}}}}}}}}};

export async function detectStructure(images, opts) {
  const content = [{ type:'text', text:'小学生用ワークのページ画像です。ページ順に示します。' }];
  images.forEach((im, i) => { content.push({ type:'text', text:'ページ'+(i+1) }); content.push(imgBlock(im)); });
  content.push({ type:'text', text:'各ページについて、大問（問1・問2…や 1,2,3）を順に挙げ、各大問の中の小問（(1)(2)…や ①②、または とい1・とい2 など）を列挙してください。各小問は label=番号、question=設問の文（短く要約可）、evidence=本文の中でその設問の答えの手がかりになる箇所をそのまま短く抜き出し（読解で本文がある場合のみ。無ければ空文字）。小問が分かれていなければ subs は空配列。表紙・目次・奥付・解答・白紙は skip=true・daimons=[]。国語の長文など、設問の前提となる「本文（読む文章）が主のページ」は honbun=true（設問ページは false）。各大問に教科カテゴリと1〜3個の日本語スキルタグ。index には示したページ番号を入れてください。' });
  return (await claudeVision(content, STRUCT_SCHEMA, { ...opts, maxTokens: 4000 })).pages || [];
}

// ===== 解答の読み取り =====
export const ANS_SCHEMA = { type:'object',additionalProperties:false,required:['answers'],properties:{answers:{type:'array',items:{type:'object',additionalProperties:false,required:['daimon','sub','answer','kind','confidence','page','box','points'],properties:{daimon:{type:'integer'},sub:{type:'integer'},answer:{type:'string'},kind:{type:'string',enum:['value','figure','writing']},confidence:{type:'number'},page:{type:'integer'},points:{type:'array',items:{type:'string'}},box:{type:'object',additionalProperties:false,required:['x','y','w','h'],properties:{x:{type:'number'},y:{type:'number'},w:{type:'number'},h:{type:'number'}}}}}}}};

// unitList: [{name, items:[{label}]}] / images: この束の解答ページ画像。answers[] を返す（page は束内1始まり）。
export async function extractAnswers(unitList, images, opts) {
  const list = unitList.map((u, di) => `大問${di+1}「${u.name}」: ` + ((u.items||[]).map((it, si) => `小問${si+1}(${it.label||''})`).join(' ') || '小問1')).join('\n');
  const content = [{ type:'text', text:'次の問題構成です。各小問の答えを、以下の解答ページから読み取ってください（このページ群に無い小問は省略可）。\n'+list+'\n\n解答（別冊）のページ画像：' }];
  images.forEach((im, i) => { content.push({ type:'text', text:'解答ページ'+(i+1) }); content.push(imgBlock(im)); });
  content.push({ type:'text', text:'各小問について daimon=大問番号, sub=小問番号, answer=答え, kind=答えの種類, confidence=自信(0-1), page, box, points を返してください。kind は、数値・記号・語句で確定する答えは "value"（answerにその答え）、図・線・斜線・印など"絵で描いて答える"ものは "figure"、文章で書く記述（答えが一つに定まらない）は "writing"。figure のときは page にその図の解答ページ番号（この束の中での1始まり）、box にその図の位置を {x,y,w,h}（左上0,0〜右下1,1の割合）で。writing のときは answer に解答例、points に採点の要点を2〜4個。value/figure では points は空配列、value/writing では page=0・box は0で構いません。' });
  return (await claudeVision(content, ANS_SCHEMA, { ...opts, maxTokens: 4000 })).answers || [];
}
