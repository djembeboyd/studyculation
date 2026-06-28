// node app/core/study.test.js
import { buildQueue, commit } from './study.js';
import { freshState, advance, addDays } from './sm2.js';
import assert from 'node:assert';

let pass = 0;
const t = (n, fn) => { fn(); pass++; console.log('  ok -', n); };
const NOW = '2026-06-28';

const units = [
  { id: 'u1', bookId: 'b1', items: [{ label: '(1)' }] },
  { id: 'u2', bookId: 'b1', items: [{ label: '(1)' }] },
  { id: 'u3', bookId: 'b2', items: [{ label: '(1)' }] },
];

t('新規ユニットは newpd 件まで', () => {
  const q = buildQueue(units, { units: {} }, { newpd: 2, cap: 15, now: NOW });
  assert.equal(q.length, 2);
});

t('due のものは出る／未来のものは出ない', () => {
  const progress = { units: {
    u1: { state: 'active', due: '2026-06-27' },   // due（過去）
    u2: { state: 'active', due: '2026-06-30' },   // まだ
    u3: { state: 'graduated', due: '2026-06-01' },// 卒業は出ない
  }};
  const q = buildQueue(units, progress, { newpd: 0, now: NOW });
  assert.deepEqual(q, ['u1']);
});

t('assignedBooks で絞り込み', () => {
  const q = buildQueue(units, { units: {} }, { assignedBooks: ['b2'], newpd: 9, now: NOW });
  assert.deepEqual(q, ['u3']);
});

t('cap で全体を制限', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, bookId: 'b1', items: [{}] }));
  const q = buildQueue(many, { units: {} }, { cap: 5, newpd: 99, now: NOW });
  assert.equal(q.length, 5);
});

t('commit: 全正解で q=5・review正答', () => {
  const items = [{ label: '(1)' }, { label: '(2)' }];
  const { state, review } = commit(freshState(), items, [true, true], { bookType: 'reps', now: NOW });
  assert.equal(review.q, 5);
  assert.equal(review.ratio, 1);
  assert.deepEqual(state.lastWrong, []);
  assert.equal(state.interval, 1); // 初回
});

t('commit: 部分点（○+△+✕）→ ratio0.5・q3・lastWrong', () => {
  const items = [{ label: '(1)' }, { label: '(2)' }, { label: '(3)' }];
  const { state, review } = commit(freshState(), items, [true, 'half', false], { now: NOW });
  assert.equal(review.score, 1.5);
  assert.equal(review.ratio, 0.5);
  assert.equal(review.q, 3);
  assert.deepEqual(state.lastWrong, ['(2)', '(3)']);
  assert.deepEqual(review.perItem.map(p => p.result), ['o', 'half', 'x']);
});

t('commit: 不正解多めで q=2・interval=1', () => {
  const items = [{ label: 'a' }, { label: 'b' }, { label: 'c' }];
  const { state, review } = commit(freshState(), items, [false, false, true], { now: NOW });
  assert.equal(review.q, 2);
  assert.equal(state.interval, 1);
  assert.equal(state.due, addDays(NOW, 1));
});

console.log(`\n${pass} 件すべて成功`);
