# Contributing

## Design before implementation

Behavioral changes follow this order:

1. Write or update a requirement under `docs/requirements/`.
2. Define observable acceptance criteria and explicitly list non-goals.
3. Write or update the corresponding design under `docs/design/`.
4. Record durable trade-offs under `docs/decisions/` when alternatives matter.
5. Obtain design approval by changing relevant documents from `Proposed` to `Approved` and ADRs from `Proposed` to `Accepted`.
6. Record executable steps with the design or experiment when the change is multi-step.
7. Implement in test-first, reviewable increments.
8. Exercise the rendered behavior, then update `CHANGELOG.md` in this folder.

Implementation must not silently outrun the approved design. If implementation evidence invalidates a design assumption, stop, update the design, and review that change before continuing.

Source is TypeScript: static contracts come from `tsc --noEmit`, runtime contracts from Zod schemas in `src/data.ts` and `src/config.ts`. Do not duplicate a schema as a hand-written interface. All policy numbers live in `config.json`; code must not reintroduce embedded defaults.

User-authorized exploration runs code from `src/` (config, parse, validate, state, layout, geometry, render, pipeline) and `tests/` (assertions, independent checks, experiment drivers), after its requirements and experiment contract are written under `docs/`. `src/` must never import `tests/`. Authorization approves the experiment scope, not a final algorithm or product. Report observed failures; do not mark final visual requirements as passed merely because an experiment runs.

## Documentation rules

- `docs/requirements/` describes what users observe and why it matters.
- `docs/design/` describes components, algorithms, contracts, failures, and verification.
- `docs/decisions/` preserves significant decisions and rejected alternatives.
- `docs/experiments/` holds experiment reports only; layout code belongs in `src/`, assertions and experiment drivers in `tests/`, generated evidence in `output/`.
- `CHANGELOG.md` (next to this file) records user-visible and engineering-process changes.
- Exploratory notes and conversations are non-normative unless incorporated into `docs/`.

Keep links relative so documentation works locally and in repository browsers.

## Change checklist

- [ ] Requirement updated or intentionally unchanged with a stated reason.
- [ ] Acceptance criteria cover the observable behavior.
- [ ] Design and ADRs match the implementation approach.
- [ ] Tests prove behavior, boundaries, and deterministic invariants.
- [ ] A real rendering smoke scenario was exercised.
- [ ] Documentation links resolve.
- [ ] `CHANGELOG.md` updated when appropriate.

## Commits

Keep commits focused. Do not combine unrelated refactors with behavior changes. The baseline SVG and A/B artifacts under `output/` are adopted evidence. Regenerate current results through the scripts, never by hand; preserve immutable before-change evidence rather than overwriting a failed case with a successful layout.
