// 子の学習ロジック（純粋）。キュー生成と採点確定。SM-2を使う。
import { freshState, advance, today } from './sm2.js';

// 今日やるユニットの並び（unitId配列）を返す。
// units: library配列 / progress: {units:{unitId:state}} / opts: 子の設定
export function buildQueue(units, progress, { assignedBooks = [], cap = 15, newpd = 6, now = today() } = {}) {
  const allowed = (u) => assignedBooks.length === 0 || assignedBooks.includes(u.bookId);
  const pst = (progress && progress.units) || {};
  const due = [], fresh = [];
  for (const u of units) {
    if (!allowed(u)) continue;
    const st = pst[u.id];
    if (!st) fresh.push(u);
    else if (st.state === 'active' && st.due <= now) due.push(u);
  }
  due.sort((a, b) => String(pst[a.id].due).localeCompare(String(pst[b.id].due)));
  let queue = [...due, ...fresh.slice(0, newpd)];
  if (queue.length > cap) queue = queue.slice(0, cap);
  return queue.map((u) => u.id);
}

// 採点を確定。subResults: 各小問 true|'half'|false。
// 返り値 {state(新しいSM-2状態), review(履歴1件)}。
export function commit(prevState, items, subResults, { bookType = 'reps', grad = 30, by = 'parent', now = today() } = {}) {
  const total = items.length || 1;
  let score = 0;
  subResults.forEach((r) => { if (r === true) score += 1; else if (r === 'half') score += 0.5; });
  const ratio = score / total;
  const q = ratio >= 0.999 ? 5 : (ratio >= 0.5 ? 3 : 2);
  const state = advance(prevState || freshState(), q, { bookType, grad, now });
  state.lastWrong = items.filter((it, i) => subResults[i] !== true).map((it) => it.label).filter(Boolean);
  const review = {
    date: now, by,
    perItem: items.map((it, i) => ({ i, label: it.label, result: subResults[i] === true ? 'o' : (subResults[i] === 'half' ? 'half' : 'x') })),
    score, ratio: +ratio.toFixed(3), q,
  };
  return { state, review };
}
