// node app/core/family.test.js
import { emptyFamily, addChild, removeChild, updateChild, getChild } from './family.js';
import assert from 'node:assert';

let pass = 0;
function t(name, fn) { fn(); pass++; console.log('  ok -', name); }

t('emptyFamily の初期形', () => {
  const f = emptyFamily();
  assert.deepEqual(f.children, []);
  assert.equal(f.settings.cap, 15);
});

t('addChild: 追加され id が振られる・元を破壊しない', () => {
  const f0 = emptyFamily();
  const snap = JSON.stringify(f0);
  const { family, child } = addChild(f0, { name: ' 太郎 ', color: '#39c' });
  assert.equal(family.children.length, 1);
  assert.equal(child.name, '太郎');          // trim される
  assert.ok(child.id);
  assert.deepEqual(child.assignedBooks, []);
  assert.equal(JSON.stringify(f0), snap);     // f0 は不変
});

t('addChild: 名前なしはエラー', () => {
  assert.throws(() => addChild(emptyFamily(), { name: '  ' }));
});

t('複数追加・removeChild', () => {
  let { family } = addChild(emptyFamily(), { name: '太郎' });
  let r = addChild(family, { name: '花子' }); family = r.family;
  assert.equal(family.children.length, 2);
  const id0 = family.children[0].id;
  family = removeChild(family, id0);
  assert.equal(family.children.length, 1);
  assert.equal(family.children[0].name, '花子');
});

t('updateChild/getChild', () => {
  let { family, child } = addChild(emptyFamily(), { name: '太郎' });
  family = updateChild(family, child.id, { points: 5, assignedBooks: ['b1'] });
  const c = getChild(family, child.id);
  assert.equal(c.points, 5);
  assert.deepEqual(c.assignedBooks, ['b1']);
});

console.log(`\n${pass} 件すべて成功`);
