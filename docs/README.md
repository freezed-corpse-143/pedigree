# Documentation

This directory is the normative source for product and engineering decisions. Exploratory conversations are inputs, not specifications.

## Document hierarchy

| Area | Purpose | Current document |
|---|---|---|
| Requirements | User-visible behavior, constraints, and acceptance criteria | [Pedigree tree layout requirements](requirements/pedigree-tree-layout.md) |
| Design | Architecture, algorithms, data flow, failure handling, and verification | [Pedigree tree layout design](design/pedigree-tree-layout.md) |
| Decisions | Durable architecture choices and rejected alternatives | [Decision index](decisions/README.md) |
| Plans | Executable, test-first implementation plans written after design approval | [Planning rules](plans/README.md) |

## Design-first lifecycle

1. Change or add a requirement document.
2. Review acceptance criteria and unresolved questions.
3. Change or add the corresponding design document.
4. Record durable trade-offs in an ADR when alternatives matter.
5. Approve the design before writing an implementation plan.
6. Implement from the approved plan using test-first, reviewable steps.
7. Update `CHANGELOG.md` with user-visible changes.

A code change that alters observable behavior must link to an approved requirement and design update. Small corrective changes may update existing documents rather than creating new ones.

## Status vocabulary

- **Draft** — open questions remain; not implementation-ready.
- **Proposed** — complete enough for review.
- **Approved** — accepted implementation contract.
- **Superseded** — replaced; points to its successor.
