// SM-2 間隔反復ロジック（純粋関数）。
// 状態は「子どもごと」(children/<id>/progress.json) に持つ。unitの内容には依存しない。
// 挙動は旧 index.html の sm2() と一致させてある。

export const GRAD_DEFAULT = 30;

// ローカル日付を 'YYYY-MM-DD' で返す
export function today(d = new Date()) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return today(d);
}

// 1ユニット分の初期状態
export function freshState() {
  return { ef: 2.5, n: 0, interval: 0, due: today(), state: 'active', history: [], pending: false, lastWrong: [] };
}

// prev: 直前の状態 / q: 0..5 の品質 / opts.bookType: 'reps'|'reading'|'writing'
// 新しい状態を返す（prev は破壊しない）。
export function advance(prev, q, { bookType = 'reps', grad = GRAD_DEFAULT, now = today() } = {}) {
  const s = { ...prev, history: [...(prev.history || [])] };
  let ef = s.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;
  let n = s.n, iv;
  if (q < 3) { n = 0; iv = 1; }
  else { if (n === 0) iv = 1; else if (n === 1) iv = 6; else iv = Math.ceil(s.interval * ef); n += 1; }
  s.ef = Math.round(ef * 100) / 100;
  s.n = n;
  s.interval = iv;
  s.due = addDays(now, iv);
  s.history.push({ date: now, q });
  // 反復学習の種類で卒業条件を分ける（2トラック）
  if (bookType === 'reps') {
    // ドリル系（計算・漢字・語句など再利用できるスキル）＝忘却曲線で反復
    if (q >= 4 && iv > grad) s.state = 'graduated';
  } else {
    // 長文読解・記述＝同じ本文の再出題は記憶になるだけなので反復しない。
    // 一度解く→（セッション内で本文付きの直し）→完了＝即卒業（忘却曲線に乗せない）。
    s.state = 'graduated';
  }
  return s;
}

// 今日やるべきか（state=active かつ due<=today）
export function isDue(state, now = today()) {
  return state && state.state === 'active' && state.due <= now;
}
