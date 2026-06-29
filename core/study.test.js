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

// ===== ラリー =====
import { startSession, activeIndices, submit, grade, nextAttempt, sessionQ, finishSession } from './study.js';

t('1発全問正解 → q5・完了', () => {
  let s = startSession(3);
  assert.deepEqual(activeIndices(s), [0,1,2]);
  s = submit(s); assert.equal(s.phase,'pending');
  s = grade(s, [true,true,true]);
  assert.equal(s.complete, true); assert.equal(s.phase,'result');
  assert.equal(sessionQ(s), 5);
});

t('やり直し1回で完成（r=0.5）→ q4', () => {
  let s = startSession(4);
  s = grade(s, [true,true,false,false]);   // attempt1: 2正解
  assert.equal(s.complete, false); assert.equal(s.firstCorrect, 2);
  assert.deepEqual(activeIndices(s), [2,3]);
  s = nextAttempt(s); assert.equal(s.attempt, 2); assert.equal(s.showAnswer, false);
  s = grade(s, [true,true]);                // 残り2つ正解
  assert.equal(s.complete, true);
  assert.equal(sessionQ(s), 4);
});

t('1発正解が半分未満・やり直しで完成 → q3', () => {
  let s = startSession(4);
  s = grade(s, [true,false,false,false]);   // 1正解 r=0.25
  s = nextAttempt(s);
  s = grade(s, [true,true,true]);
  assert.equal(s.complete, true);
  assert.equal(sessionQ(s), 3);
});

t('3回目（答え表示）まで行く → q2・showAnswer', () => {
  let s = startSession(2);
  s = grade(s, [false,false]);   // attempt1 全✕
  assert.equal(s.complete, false);
  s = nextAttempt(s); assert.equal(s.attempt, 2); assert.equal(s.showAnswer, false);
  s = grade(s, [false,false]);   // attempt2 まだ✕
  assert.equal(s.complete, false);
  s = nextAttempt(s); assert.equal(s.attempt, 3); assert.equal(s.showAnswer, true);
  s = grade(s, [true,true]);     // 3回目
  assert.equal(s.complete, true);
  assert.equal(sessionQ(s), 2);
});

t('finishSession: SM-2前進＋review', () => {
  const items = [{label:'(1)'},{label:'(2)'},{label:'(3)'}];
  let s = startSession(3);
  s = grade(s, [true,true,true]);
  const { state, review } = finishSession(freshState(), items, s, { bookType:'reps', now:NOW });
  assert.equal(review.q, 5);
  assert.equal(review.attempts, 1);
  assert.equal(review.sawAnswer, false);
  assert.equal(state.interval, 1);
  assert.deepEqual(state.lastWrong, []);
});

t('finishSession: 3回目答えは間隔リセット(翌日)', () => {
  const items = [{label:'a'},{label:'b'}];
  let s = startSession(2);
  s = grade(s,[false,false]); s = nextAttempt(s); s = grade(s,[false,false]); s = nextAttempt(s); s = grade(s,[true,true]);
  const { state, review } = finishSession(freshState(), items, s, { now:NOW });
  assert.equal(review.q, 2);
  assert.equal(state.interval, 1);
  assert.equal(state.due, addDays(NOW,1));
});

console.log(`\n${pass} 件すべて成功`);
