// node app/core/sm2.test.js で実行
import { freshState, advance, addDays, today, isDue, GRAD_DEFAULT } from './sm2.js';
import assert from 'node:assert';

let pass = 0;
function t(name, fn) { fn(); pass++; console.log('  ok -', name); }

const NOW = '2026-06-28';

t('addDays/today 整合', () => {
  assert.equal(addDays('2026-06-28', 6), '2026-07-04');
  assert.equal(addDays('2026-06-28', 0), '2026-06-28');
});

t('reps: 0→1→6→17→卒業(>30)', () => {
  let s = freshState();
  s = advance(s, 5, { bookType: 'reps', now: NOW });
  assert.equal(s.interval, 1); assert.equal(s.n, 1); assert.equal(s.state, 'active');
  s = advance(s, 5, { bookType: 'reps', now: NOW });
  assert.equal(s.interval, 6); assert.equal(s.n, 2);
  s = advance(s, 5, { bookType: 'reps', now: NOW });
  assert.equal(s.interval, 17); assert.equal(s.n, 3); // ceil(6*2.8)
  s = advance(s, 5, { bookType: 'reps', now: NOW });
  assert.equal(s.interval, 50); // ceil(17*2.9)
  assert.equal(s.state, 'graduated'); // 50 > 30
});

t('q<3 で n リセット・interval=1・ef低下', () => {
  let s = freshState();
  s = advance(s, 5, { now: NOW });       // ef 2.6, n1
  s = advance(s, 2, { now: NOW });
  assert.equal(s.n, 0); assert.equal(s.interval, 1);
  assert.ok(s.ef < 2.6, 'ef が下がる');
  assert.equal(s.due, addDays(NOW, 1));
});

t('ef は 1.3 を下回らない', () => {
  let s = freshState();
  for (let i = 0; i < 10; i++) s = advance(s, 0, { now: NOW });
  assert.equal(s.ef, 1.3);
});

t('reading: 一度の完了で卒業（SM-2の反復に乗せない）', () => {
  let s = freshState();
  s = advance(s, 4, { bookType: 'reading', now: NOW });
  assert.equal(s.state, 'graduated'); // 1回で完了＝再出題しない
});
t('reading: 答えを見て低品質でも卒業（再出題しない）', () => {
  let s = freshState();
  s = advance(s, 2, { bookType: 'reading', now: NOW });
  assert.equal(s.state, 'graduated'); // 直しは済んでいる前提で完了扱い
});

t('isDue: active かつ due<=today', () => {
  assert.equal(isDue({ state: 'active', due: '2026-06-27' }, NOW), true);
  assert.equal(isDue({ state: 'active', due: '2026-06-29' }, NOW), false);
  assert.equal(isDue({ state: 'graduated', due: '2026-06-01' }, NOW), false);
});

t('advance は prev を破壊しない', () => {
  const s0 = freshState();
  const snap = JSON.stringify(s0);
  advance(s0, 5, { now: NOW });
  assert.equal(JSON.stringify(s0), snap);
});

console.log(`\n${pass} 件すべて成功`);
