# Contributing

## Design before implementation

Behavioral changes follow this order:

1. Write or update a requirement under `docs/requirements/`.
2. Define observable acceptance criteria and explicitly list non-goals.
3. Write or update the corresponding design under `docs/design/`.
4. Record durable trade-offs under `docs/decisions/` when alternatives matter.
5. Obtain design approval by changing relevant documents from `Proposed` to `Approved` and ADRs from `Proposed` to `Accepted`.
6. Write an implementation plan under `docs/plans/`.
7. Implement in test-first, reviewable increments.
8. Exercise the rendered behavior, then update `CHANGELOG.md`.

Implementation must not silently outrun the approved design. If implementation evidence invalidates a design assumption, stop, update the design, and review that change before continuing.

## Documentation rules

- `docs/requirements/` describes what users observe and why it matters.
- `docs/design/` describes components, algorithms, contracts, failures, and verification.
- `docs/decisions/` preserves significant decisions and rejected alternatives.
- `docs/plans/` contains executable steps only after approval.
- `CHANGELOG.md` records user-visible and engineering-process changes.
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

Keep commits focused. Do not combine unrelated refactors with behavior changes. Generated exports and temporary visual-check artifacts should not be committed unless the project later adopts them as fixtures.
