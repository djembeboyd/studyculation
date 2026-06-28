// node app/core/ai.test.js  — 推論応答からのJSON抽出が壊れないか
import { parseJsonBlock } from './ai.js';
import assert from 'node:assert';
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok -', n); };

t('考え＋```json```ブロック', () => {
  const s = 'まず線をたどります。①はろくで6。\n```json\n{"answers":[{"daimon":1,"sub":1,"answer":"6"}]}\n```\nおわり';
  assert.equal(parseJsonBlock(s).answers[0].answer, '6');
});
t('言語タグなしの```ブロック', () => {
  const s = 'こたえ:\n```\n{"pages":[{"index":1}]}\n```';
  assert.equal(parseJsonBlock(s).pages[0].index, 1);
});
t('フェンス無し・前後にテキスト', () => {
  const s = '結論です {"answers":[{"daimon":2,"sub":3,"answer":"7"}]} 以上';
  assert.equal(parseJsonBlock(s).answers[0].answer, '7');
});
t('素のJSON', () => {
  assert.deepEqual(parseJsonBlock('{"answers":[]}').answers, []);
});

console.log(`\n${pass} 件すべて成功`);
