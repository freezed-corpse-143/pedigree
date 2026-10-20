import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TreeNode } from '../src/data.ts';
import { parseTreeText, readTreeFile, TreeParseError } from '../src/parse.ts';
import { validateTree, TreeValidationError, type TreeValidationCode } from '../src/validate-tree.ts';

const node = (id: string, ...children: TreeNode[]): TreeNode => ({ id, children });
const tree = node('root', node('left'), node('right', node('tip')));
const json = JSON.stringify(tree);
const yaml = `id: root
children:
  - id: left
    children: []
  - id: right
    children:
      - id: tip
        children: []
`;

function rejectsTree(value: unknown, code: TreeValidationCode, rootCount?: number): void {
  assert.throws(() => validateTree(value), (error: unknown) => {
    assert(error instanceof TreeValidationError);
    assert(error instanceof TypeError);
    assert.equal(error.code, code);
    assert.equal(error.rootCount, rootCount);
    return true;
  });
}

for (const format of ['json', '.json', 'JSON', '.JsOn']) {
  assert.deepEqual(validateTree(parseTreeText(`\uFEFF${json}`, format)), tree);
}
for (const format of ['yaml', 'yml', '.yaml', '.YML']) {
  assert.deepEqual(validateTree(parseTreeText(`\uFEFF${yaml}`, format)), tree);
}
assert.deepEqual(validateTree(parseTreeText(JSON.stringify([tree]), 'json')), tree);
assert.equal(parseTreeText('42', 'json'), 42, 'Parsing does not validate tree structure');
rejectsTree(parseTreeText('42', 'json'), 'TREE_NODE');
rejectsTree(parseTreeText('', 'yaml'), 'TREE_ROOT_COUNT', 0);
rejectsTree(parseTreeText(`---\n${yaml}---\nid: other\nchildren: []\n`, 'yaml'), 'TREE_ROOT_COUNT', 2);

for (const format of ['', '.txt', 'xml', 'json5']) {
  assert.throws(() => parseTreeText(json, format), (error: unknown) => {
    assert(error instanceof TreeParseError);
    assert.equal(error.code, 'TREE_FORMAT');
    assert.match(error.message, /unsupported/i);
    return true;
  });
}
for (const [text, format] of [['{"id":', 'json'], ['children: [', 'yaml']]) {
  assert.throws(() => parseTreeText(text, format), (error: unknown) => {
    assert(error instanceof TreeParseError);
    assert.equal(error.code, 'TREE_SYNTAX');
    assert(error.cause instanceof Error);
    assert.match(error.message, /json|yaml/i);
    return true;
  });
}

rejectsTree(null, 'TREE_ROOT_COUNT', 0);
rejectsTree([], 'TREE_ROOT_COUNT', 0);
rejectsTree([node('a'), node('b')], 'TREE_ROOT_COUNT', 2);
rejectsTree([tree, tree, tree], 'TREE_ROOT_COUNT', 3);
for (const invalid of [
  undefined, false, 1, 'root', [null], [[]], {},
  { id: 'leaf' }, { id: '', children: [] }, { id: ' \t\n', children: [] },
  { id: 1, children: [] }, { id: null, children: [] },
  { id: 'leaf', children: null }, { id: 'leaf', children: {} },
  { id: 'root', children: [null] }, { id: 'root', children: [{ id: 'leaf' }] },
]) rejectsTree(invalid, 'TREE_NODE');
assert.deepEqual(validateTree(node('leaf')), node('leaf'));
assert.deepEqual(validateTree(node(' surrounded ')), node(' surrounded '), 'IDs are not rewritten');

const selfCycle = node('self');
selfCycle.children.push(selfCycle);
rejectsTree(selfCycle, 'TREE_CYCLE');
const cycleRoot = node('cycle-root', node('cycle-child'));
cycleRoot.children[0].children.push(cycleRoot);
rejectsTree(cycleRoot, 'TREE_CYCLE');
const shared = node('shared');
rejectsTree(node('root', shared, shared), 'TREE_SHARED_CHILD');
rejectsTree(node('root', node('a', shared), node('b', shared)), 'TREE_SHARED_CHILD');
rejectsTree(node('same', node('same')), 'TREE_DUPLICATE_ID');
rejectsTree(node('root', node('a', node('same')), node('b', node('same'))), 'TREE_DUPLICATE_ID');

const original = {
  id: 'original',
  children: [{ id: 'child', children: [], label: 'ignored child metadata' }],
  label: 'ignored root metadata',
};
const before = JSON.stringify(original);
const detached = validateTree(original);
assert.deepEqual(detached, node('original', node('child')));
assert.notEqual(detached, original);
assert.notEqual(detached.children, original.children);
assert.notEqual(detached.children[0], original.children[0]);
assert.notEqual(detached.children[0].children, original.children[0].children);
detached.children[0].id = 'changed';
detached.children.push(node('new'));
assert.equal(JSON.stringify(original), before, 'Validation and output mutation leave input unchanged');

// Metadata anchors are harmless when the referenced node has only one tree parent.
const aliasOnce = parseTreeText(`id: root
leaf: &leaf
  id: leaf
  children: []
children: [*leaf]
`, 'yaml');
assert.deepEqual(validateTree(aliasOnce), node('root', node('leaf')));
const aliases = parseTreeText(`id: root
children:
  - &leaf {id: leaf, children: []}
  - *leaf
`, 'yaml');
assert(aliases !== null && typeof aliases === 'object' && 'children' in aliases);
assert(Array.isArray(aliases.children));
rejectsTree(aliases, aliases.children[0] === aliases.children[1] ? 'TREE_SHARED_CHILD' : 'TREE_DUPLICATE_ID');

// Bun may reject recursive aliases at the syntax boundary instead of representing a cyclic graph.
let recursiveAlias: unknown;
let recursiveAliasRejected = false;
try {
  recursiveAlias = parseTreeText('&root {id: root, children: [*root]}', 'yaml');
} catch (error) {
  assert(error instanceof TreeParseError);
  assert.equal(error.code, 'TREE_SYNTAX');
  assert(error.cause instanceof Error);
  recursiveAliasRejected = true;
}
if (!recursiveAliasRejected) rejectsTree(recursiveAlias, 'TREE_CYCLE');

const deep = node('deep-0');
let cursor = deep;
for (let i = 1; i < 5000; i++) {
  const child = node(`deep-${i}`);
  cursor.children.push(child);
  cursor = child;
}
let normalized = validateTree(deep);
for (let i = 0; i < 5000; i++) {
  assert.equal(normalized.id, `deep-${i}`);
  if (i < 4999) normalized = normalized.children[0];
}
cursor.children.push(deep);
rejectsTree(deep, 'TREE_CYCLE');

const directory = await mkdtemp(join(tmpdir(), 'pedigree-input-'));
try {
  for (const extension of ['json', 'JSON', 'yaml', 'yml']) {
    const path = join(directory, `tree.${extension}`);
    await writeFile(path, `\uFEFF${extension.toLowerCase() === 'json' ? json : yaml}`, 'utf8');
    assert.deepEqual(validateTree(await readTreeFile(path)), tree);
  }
  for (const [filename, text, code] of [
    ['tree.txt', json, 'TREE_FORMAT'],
    ['bad.json', '{"id":', 'TREE_SYNTAX'],
    ['bad.yaml', 'children: [', 'TREE_SYNTAX'],
  ]) {
    const path = join(directory, filename);
    await writeFile(path, text, 'utf8');
    await assert.rejects(() => readTreeFile(path), (error: unknown) => {
      assert(error instanceof TreeParseError);
      assert.equal(error.code, code);
      assert(error.message.includes(path), 'File diagnostics include the input filename');
      assert(error.cause instanceof TreeParseError);
      return true;
    });
  }
  await assert.rejects(() => readTreeFile(join(directory, 'missing.json')), { code: 'ENOENT' });
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('input: parsing, detached tree validation, and graph diagnostics checked');
