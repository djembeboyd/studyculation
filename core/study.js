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

/* ===== ラリー（子↔親）＋SM-2マッピング =====
   1セッション＝最大3回の往復。1・2回目は答え非表示、3回目は答え表示。
   親が○✕→正解は確定、✕は次の回へ。全部正解 or 3回目終了でセッション完了→SM-2へ。 */

// 新しいセッション（大問の小問数）
export function startSession(itemCount) {
  return { attempt: 1, total: itemCount, resolved: Array(itemCount).fill(false), firstCorrect: null, phase: 'answering', showAnswer: false, complete: false };
}
// この回で子が解く／親が採点する対象（まだ正解していない小問のindex）
export function activeIndices(session) {
  const out = []; (session.resolved || []).forEach((r, i) => { if (!r) out.push(i); }); return out;
}
// 子が提出
export function submit(session) { return { ...session, phase: 'pending' }; }
// 親が採点。marks = activeIndices(session) と同じ並びの true(○)|false(✕)|'half'(△)
export function grade(session, marks) {
  const s = { ...session, resolved: [...session.resolved] };
  const active = activeIndices(session);
  active.forEach((idx, k) => { if (marks[k] === true) s.resolved[idx] = true; });
  if (s.attempt === 1) s.firstCorrect = s.resolved.filter(Boolean).length;
  const allResolved = s.resolved.every(Boolean);
  s.complete = allResolved || s.attempt >= 3;
  s.phase = 'result'; // 子が結果(○✕)を確認するフェーズ
  return s;
}
// 結果確認のあと、未完了なら次の回へ（子がやり直し）
export function nextAttempt(session) {
  const a = session.attempt + 1;
  return { ...session, attempt: a, phase: 'answering', showAnswer: a >= 3 };
}
// セッション完了時の評価値 q（0-5）
export function sessionQ(session) {
  if (session.attempt >= 3) return 2;                    // 3回目まで行った＝答えを見た／不合格
  const r = (session.firstCorrect ?? 0) / (session.total || 1);
  if (r >= 0.999) return 5;                              // 1発全問正解
  if (r >= 0.5) return 4;                                // 半分以上を1発
  return 3;                                              // やり直しで完成
}
// セッション完了→SM-2前進。{state, review} を返す。
export function finishSession(prevState, items, session, { bookType = 'reps', grad = 30, now = today() } = {}) {
  const q = sessionQ(session);
  const state = advance(prevState || freshState(), q, { bookType, grad, now });
  state.lastWrong = items.filter((it, i) => !session.resolved[i]).map((it) => it.label).filter(Boolean);
  const review = {
    date: now, by: 'parent',
    perItem: items.map((it, i) => ({ i, label: it.label, result: session.resolved[i] ? 'o' : 'x' })),
    attempts: session.attempt, sawAnswer: session.attempt >= 3, q,
  };
  return { state, review };
}
