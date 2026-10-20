import { run } from './pipeline.ts';

// Entry only wires the pipeline; every path, title and numeric policy comes from config.
const { output, state } = await run(process.argv[2]);
console.log(`${state.nodes.length} frames, wrote ${output}`);
