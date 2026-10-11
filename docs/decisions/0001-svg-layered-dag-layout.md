# ADR 0001: SVG with Layered DAG Layout

- **Status:** Accepted
- **Date:** 2026-10-11

## Context

The project must turn a DAG of no more than roughly 100 visible people into a report-quality organic tree. The root sits at the bottom, relationship edges become natural branches, multi-parent relationships use invisible junctions, and decorative twigs remain non-semantic. The full result must be suitable for academic and commercial reports.

## Decision

Use:

- `d3-dag` Sugiyama layout for rank assignment, crossing reduction, and initial coordinates;
- a small project-specific horizontal allocation and branch-aware repair pass;
- standards-based SVG for all structural branches, decoration, connectors, cards, and labels;
- complete relayout after any graph or geometry change;
- a virtual canvas that expands rather than shrinking cards.

## Consequences

### Positive

- Handles true DAGs rather than only strict trees.
- Exposes coordinates needed for custom organic branch rendering.
- SVG remains vector-editable and report-friendly.
- One rendering technology keeps layer alignment exact.
- The expected node count does not justify Canvas/WebGL complexity.

### Negative

- Organic routing and decorative growth remain project-specific code.
- `d3-dag` does not by itself enforce the desired tree-crown density.
- Full relayout may move every node after a small graph change; this is accepted.

## Alternatives considered

- **`family-chart`:** strong family semantics and cards, but its built-in presentation does not provide the required branch geometry and mount-driven layered rendering.
- **Graphviz `dot`:** supports bottom-to-top layered DAGs and SVG output, but offers less direct control over interactive, tapered organic branches.
- **Cytoscape.js + fCoSE:** supports fixed and relative constraints, but force-directed output is less aligned with deterministic generational ranks.
- **Canvas/WebGL:** unnecessary for the target of at most 100 visible nodes and weaker for editable report output.
- **Full non-convex density optimization:** deferred until simpler layered layout demonstrably fails.
