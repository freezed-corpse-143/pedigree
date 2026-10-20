import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Conflict } from '../src/geometry.ts';

type CaseResult = { status: 'ok', svgSha256: string } | { status: 'rejected', node: string, conflict: Conflict };
export type CorpusCase = CaseResult & { index: number, root: unknown };
export type Corpus = { seed: number, cases: CorpusCase[] };

export async function readCorpus(path: URL): Promise<Corpus> {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Rebuild the frozen corpus with the original generator and prove the stored inputs still match. */
export function replayRoots(corpus: Corpus): unknown[] {
  let seed = corpus.seed;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  return corpus.cases.map(c => {
    const count = 2 + Math.floor(random() * 18);
    const nodes = Array.from({ length: count }, (_, i) => ({ id: `n${i}`, children: [] as { id: string, children: unknown[] }[] }));
    for (let i = 1; i < count; i++) nodes[Math.floor(random() * i)]!.children.push(nodes[i]!);
    assert.deepEqual(nodes[0], c.root, `Frozen corpus input ${c.index}`);
    return nodes[0];
  });
}
