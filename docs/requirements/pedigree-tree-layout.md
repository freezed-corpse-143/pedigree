# Pedigree Tree Layout Requirements

- **Status:** Approved
- **Date:** 2026-10-11
- **Visual reference:** [`../../pedigree.example.png`](../../pedigree.example.png)
- **Related design:** [`../design/pedigree-tree-layout.md`](../design/pedigree-tree-layout.md)

## 1. Purpose

Generate a report-quality pedigree tree from a DAG and presentation settings. The result must read as an organic tree: its root starts at the bottom, semantic branches grow upward, portrait cards hang from computed mounting points, and non-semantic twigs enrich the composition.

Primary use is academic and commercial reporting. Typical diagrams contain at most 100 visible person nodes; larger diagrams are an unsupported readability tail rather than the optimization target.

## 2. Terminology

- **Person node:** visible card containing a portrait and report data.
- **Relationship edge:** semantic DAG edge.
- **Union node:** invisible layout node representing a multi-parent family/partnership junction.
- **Mounting point:** computed attachment coordinate for a visible person card.
- **Structural branch:** natural branch representing a semantic relationship edge.
- **Decorative twig:** non-semantic branch or foliage used only for visual balance.
- **Initial viewport:** requested visible width and height.
- **Virtual canvas:** complete layout surface, which may grow beyond the initial viewport.

## 3. Inputs

The layout request must provide:

- a directed acyclic graph with stable node and edge identifiers;
- one designated root node;
- node dimensions or a documented default card size;
- an initial viewport width and height;
- layout margins and minimum horizontal/vertical spacing;
- content and style data required by the person cards;
- an optional deterministic decoration seed.

Invalid references, duplicate identifiers, cycles, a missing root, or unreachable nodes must produce explicit validation errors. The implementation must not silently delete or reconnect graph data.

## 4. Functional requirements

### FR-1: Growth direction

The designated root must be centered near the bottom of the virtual canvas. Every semantic path must progress upward in screen coordinates. A descendant connected by an upward edge must have sufficient vertical clearance from its predecessor.

### FR-2: Adaptive branching

The horizontal span assigned to a branch must reflect the size of its reachable subgraph, including visible card area. Larger subgraphs receive more room. Sibling branches should be visually balanced without requiring strict mirror symmetry.

### FR-3: Canvas utilization

The layout must use the available width and height instead of collapsing around the center or pushing all nodes to the boundary. Nodes must not overlap cards, labels, or required margins.

If the graph cannot fit while preserving card size and minimum spacing, the virtual canvas must expand. The initial viewport remains available through fit-to-view, zoom, and pan.

### FR-4: Full recomputation

Every graph, node-size, or viewport change must trigger a deterministic full layout. Global crossing reduction, spacing, and visual balance take precedence over preserving previous coordinates.

### FR-5: Multi-parent relationships

Multiple parents must connect through an invisible union node. Parent branches meet at that junction, and a structural branch continues from the junction toward the child. Union nodes participate in ranking, ordering, collision checks, and routing but do not render as cards.

### FR-6: Structural branches

Every normalized DAG edge must produce a natural structural branch. Structural branches must connect the relevant mounting points or union junctions, avoid unrelated cards, and visually taper as they move away from the root.

### FR-7: Layer separation

Structural branches and person mounting points must be represented in separate rendering layers. Mounting points drive branch geometry. Branch routing may request a bounded layout correction when a structural branch intersects an unrelated card; decorative elements must never move mounting points.

### FR-8: Decorative growth

The renderer may generate short twigs, tips, and foliage in unused branch regions. Decorative growth must:

- carry no relationship meaning;
- create no mounting points;
- avoid cards, labels, union junctions, and structural connection zones;
- be deterministic for identical input and seed;
- remain visually subordinate to structural branches.

### FR-9: Rendering and export

The canonical output must be SVG. Rendering order must preserve semantic readability:

1. background;
2. structural branches;
3. decorative twigs and foliage;
4. hanging connectors;
5. person cards and labels.

The complete virtual canvas must be exportable. Raster or PDF export may be derived from the canonical SVG without changing layout.

## 5. Quality requirements

- **Determinism:** identical normalized input, settings, and seed produce identical geometry.
- **Readability:** relationship branches remain distinguishable at the intended report size.
- **Capacity target:** optimize for up to 100 visible person nodes.
- **Maintainability:** layout, branch geometry, decoration, and rendering remain separate modules.
- **Portability:** canonical output uses standards-based SVG without server-only rendering requirements.

## 6. Acceptance criteria

1. A single-node DAG places its root card at the bottom center without structural branches.
2. A chain grows monotonically upward with no card overlap.
3. Unequal sibling subgraphs receive visibly different horizontal spans while remaining inside the virtual canvas.
4. A two-parent child is routed through one invisible union node.
5. Every normalized semantic edge maps to exactly one structural branch segment or one documented segment of a union route.
6. Decorative twigs do not intersect card exclusion boxes and do not alter semantic edge counts.
7. An undersized initial viewport causes virtual-canvas expansion rather than card scaling.
8. Relayout of identical input produces identical coordinates and SVG geometry.
9. Modifying the graph triggers a full layout and may reposition unaffected nodes.
10. The resulting SVG remains legible and editable in a vector graphics workflow.

## 7. Non-goals

- Optimizing readability beyond 100 visible person nodes.
- Inferring graph semantics from a bitmap tree image.
- Preserving previous positions after graph changes.
- Real-time collaborative editing.
- Photorealistic procedural botany.
- Treating decorative twigs as navigable graph data.

## 8. Open decisions

These do not block the requirements but must be resolved before implementation planning:

- exact person-card schema and default dimensions;
- required interaction surface beyond fit-to-view, zoom, and pan;
- mandatory derived export formats: PNG, PDF, or both;
- branch and foliage art direction beyond the supplied reference image.
