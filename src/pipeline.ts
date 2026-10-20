import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadConfig } from './config.ts';
import type { AppConfig } from './config.ts';
import { readTreeFile } from './parse.ts';
import { validateTree } from './validate-tree.ts';
import { initializeTree, applyLayout } from './state.ts';
import { layoutStemScene } from './layout/index.ts';
import { sceneBounds, stemSvg } from './render.ts';
import type { LaidOutTree, SceneBounds } from './data.ts';
import { frameMount } from './mount.ts';
import type { Mount } from './mount.ts';

export type RunResult = { config: AppConfig; state: LaidOutTree; bounds: SceneBounds; output: string };

/**
 * Orchestration only: config -> parse -> validate -> initialize -> layout -> apply -> render -> write.
 * Any earlier failure leaves the previous output untouched.
 */
export async function run(configPath?: string, options: { mount?: Mount } = {}): Promise<RunResult> {
  const mount = options.mount ?? frameMount;
  const config = await loadConfig(configPath);
  const draft = initializeTree(validateTree(await readTreeFile(config.input)), config, mount);
  const state = applyLayout(draft, layoutStemScene(draft, config.layout));
  const bounds = sceneBounds(state);
  const output = resolve(config.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, stemSvg(state, bounds, config.title, mount));
  return { config, state, bounds, output };
}
