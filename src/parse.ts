import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

export type TreeParseCode = 'TREE_FORMAT' | 'TREE_SYNTAX';

export class TreeParseError extends Error {
  constructor(readonly code: TreeParseCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TreeParseError';
  }
}

export function parseTreeText(text: string, format: string): unknown {
  const normalized = format.toLowerCase().replace(/^\./, '');
  if (normalized !== 'json' && normalized !== 'yaml' && normalized !== 'yml') {
    throw new TreeParseError('TREE_FORMAT', `Unsupported tree format: ${format || '(none)'}`);
  }
  const source = text.replace(/^\uFEFF/, '');
  try {
    return normalized === 'json' ? JSON.parse(source) : Bun.YAML.parse(source);
  } catch (cause) {
    throw new TreeParseError('TREE_SYNTAX', `Invalid ${normalized.toUpperCase()} tree syntax`, { cause });
  }
}

export async function readTreeFile(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  try {
    return parseTreeText(text, extname(path));
  } catch (cause) {
    if (cause instanceof TreeParseError) {
      throw new TreeParseError(cause.code, `${path}: ${cause.message}`, { cause });
    }
    throw cause;
  }
}
