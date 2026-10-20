import { TreeNodeShallowSchema, type TreeNode } from './data.ts';

export type TreeValidationCode =
  | 'TREE_ROOT_COUNT'
  | 'TREE_CYCLE'
  | 'TREE_SHARED_CHILD'
  | 'TREE_DUPLICATE_ID'
  | 'TREE_NODE';

export class TreeValidationError extends TypeError {
  readonly rootCount: number | undefined;

  constructor(
    readonly code: TreeValidationCode,
    message: string,
    options: ErrorOptions & { rootCount?: number } = {},
  ) {
    super(message, options);
    this.name = 'TreeValidationError';
    this.rootCount = options.rootCount;
  }
}

type Visit =
  | { kind: 'enter'; value: unknown; output: TreeNode[] }
  | { kind: 'exit'; value: object };

export function validateTree(value: unknown): TreeNode {
  const roots: unknown[] = value === null ? [] : Array.isArray(value) ? value : [value];
  if (roots.length !== 1) {
    throw new TreeValidationError('TREE_ROOT_COUNT', `Expected one tree root; received ${roots.length}`, {
      rootCount: roots.length,
    });
  }

  const output: TreeNode[] = [];
  const active = new WeakSet<object>();
  const seen = new WeakSet<object>();
  const ids = new Set<string>();
  const stack: Visit[] = [{ kind: 'enter', value: roots[0], output }];

  // Shallow Zod checks plus iterative traversal avoid recursion on untrusted graphs or deep trees.
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (current.kind === 'exit') {
      active.delete(current.value);
      continue;
    }
    const input = current.value;
    if (input === null || typeof input !== 'object') {
      throw new TreeValidationError('TREE_NODE', 'Each tree node must be an object with id and children');
    }
    if (active.has(input)) {
      throw new TreeValidationError('TREE_CYCLE', 'Tree contains a cycle: a child references its ancestor');
    }
    if (seen.has(input)) {
      throw new TreeValidationError('TREE_SHARED_CHILD', 'Tree contains a shared child object with multiple parent edges');
    }
    const parsed = TreeNodeShallowSchema.safeParse(input);
    if (!parsed.success) {
      throw new TreeValidationError('TREE_NODE', `Invalid tree node: ${parsed.error.message}`, {
        cause: parsed.error,
      });
    }
    if (ids.has(parsed.data.id)) {
      throw new TreeValidationError('TREE_DUPLICATE_ID', `Duplicate tree node ID: ${JSON.stringify(parsed.data.id)}`);
    }
    ids.add(parsed.data.id);
    seen.add(input);
    active.add(input);

    const node: TreeNode = { id: parsed.data.id, children: [] };
    current.output.push(node);
    stack.push({ kind: 'exit', value: input });
    for (let index = parsed.data.children.length - 1; index >= 0; index--) {
      stack.push({ kind: 'enter', value: parsed.data.children[index], output: node.children });
    }
  }
  return output[0];
}
