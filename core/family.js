// family.json（家族設定＋子どもプロフィール）の純粋ロジック。Drive非依存・テスト可能。

export function newId(prefix = 'c') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function emptyFamily() {
  return {
    schemaVersion: '2.1',
    settings: { cap: 15, newpd: 6, grad: 30, readClimb: 0, markBy: 'parent' }, // 採点は既定で親。切替可

    children: [],
  };
}

// 子を1人追加。{family, child} を返す（family は新しいオブジェクト、元は破壊しない）。
export function addChild(family, { name, color = '#ff8c42', pin = '' } = {}) {
  if (!name || !String(name).trim()) throw new Error('子どもの名前が必要です');
  const f = { ...family, children: [...(family.children || [])] };
  const child = {
    id: newId('c'),
    name: String(name).trim(),
    color,
    pin: String(pin || ''),
    assignedBooks: [],            // 空=全教材。子ごとの出し分けに使う
    streak: 0, last: '', points: 0, readClimb: 0,
    settingsOverride: {},
  };
  f.children.push(child);
  return { family: f, child };
}

export function removeChild(family, childId) {
  return { ...family, children: (family.children || []).filter((c) => c.id !== childId) };
}

export function updateChild(family, childId, patch) {
  return {
    ...family,
    children: (family.children || []).map((c) => (c.id === childId ? { ...c, ...patch } : c)),
  };
}

export function getChild(family, childId) {
  return (family.children || []).find((c) => c.id === childId) || null;
}
