# STRUX Academic Research Edition — Development Status

**Status date:** 2026-10-31
**Evidence basis:** direct source audit plus local commands recorded in `TEST_REPORT.md`.
**Safety position:** research prototype only; never use it for safety-critical engineering decisions.

## Milestone status

| Milestone | Status | Evidence and boundary |
|---|---|---|
| M1 — Foundation and architecture | COMPLETE | Typed SI structural domain, validation/import boundary, undo/redo state, portable JSON, platform-file adapter, documented coordinate convention, test evidence, license inventory, and review documentation are present. A single shared React client is intentionally the current common source for web and Tauri; split workspaces are deferred until a second deployable app needs independent versioning. |
| M2 — Interactive 3D structural modeling | COMPLETE | The renderer now provides grid and exact-coordinate placement (including elevation), shift-selectable node sets, atomic numeric set transforms, member creation/editing, provisional local X/Y/Z visual axes with roll, node labels, and ISO/top/front/right camera presets. The model reducer has automated tests for the new transform undo/redo path and local-axis coordinate math; the acceptance record includes an isolated browser interaction check. These are visualization/authoring features only, not FEM conventions or analysis results. |
| M3 — Engineering data, loads and supports | COMPLETE | Version-2 project data now supports editable load cases, editable load-combination factors, nodal/member point/member distributed loads, local/global member directions, self-weight declarations, editable material/section libraries, six-DOF support restraints, and member end releases. Validation rejects invalid quantities, directions, references, factors, sections, supports and releases; V1 project files migrate without unit conversion. These are validated input records only—no solver, combination evaluation or engineering results exist. |
| M4 — PyNite FEM integration | COMPLETE — EXPERIMENTAL | PyNiteFEA 3.2.1 is isolated behind versioned JSON contracts, a pure SI translator and a Python runner. B1–B5 targeted benchmarks pass for displacements, reactions, member force samples, combinations, releases and equilibrium. Unsupported/unstable models return no-result diagnostics. The Tauri bridge is implemented but native compilation/launch is NOT RUN. Professor review and license audit remain mandatory. |
| M5 — Results and reporting | PARTIAL — EXPERIMENTAL | Provenance-checked result contracts drive deformed geometry, reaction vectors/tables, displacement tables, axial/shear/moment diagrams, unit-aware summaries and HTML/PDF exports. TypeScript and report tests pass; browser/Tauri runtime verification is NOT RUN by request. No result is production-ready. |
| M6 — Windows desktop packaging and limited web | PARTIAL | Vite browser build passes; the Tauri 2 development host compiled and launched `strux.exe` after icon and local-port repair. Windows installer generation, installation, capability interaction and native file I/O remain NOT RUN. |
| M7 — Multi-storey building modeling | COMPLETE — MODELING / EXPERIMENTAL QUAD3D | Schema-v3 building data provides storeys, X/Z grids, generated storey-connected frames, floor-member copying, polygonal slabs/openings, structural walls, floor visibility/isolation and dependency-aware deletion. M7D admits only current quad4 source meshes to the experimental solver; no frame approximation is made. Browser/Tauri visual regression is NOT RUN by M7 scope. |
| M7B — Extended structural modeling | COMPLETE — INPUT / MESH AUTHORING | Schema-v4 adds generated slab/wall authoring meshes, mesh quality/staleness checks, rigid/semi-rigid diaphragms, springs, settlements, offsets, rigid links, advanced load declarations, SI catalogue provenance, and basic DXF LINE/POLYLINE import. M7D admits only validated quad4 meshes and signed surface pressures; all other M7B inputs remain explicitly rejected. |
| M7C — Complete mesh geometry and UI | COMPLETE — MESH AUTHORING | Deterministic constrained slab triangulation preserves one or more internal openings, with post-generation opening, connectivity, area and source-staleness checks. The inspector/model tree/viewport expose mesh preview, diaphragm assignment, foundation/kinematic inputs, offsets, links, advanced loads, catalogue metadata and DXF import. Generated tri3 opening meshes remain explicitly rejected; browser/Tauri visual regression is NOT RUN by scope. |
| M7D — Plate/shell FEM integration | COMPLETE — EXPERIMENTAL / LIMITED | Solver-input/result v2 maps validated quad4 surface meshes to PyNiteFEA 3.2.1 `Quad3D`, maps source material/thickness, shared analytical-node connectivity, six-DOF supports and signed pressure loads, and reports real nodal displacements plus local membrane stress/shear/moment resultants. B6 clamped-square plate, B7 membrane patch, B8 invalid/singular rejection and B1–B5 regressions pass. Tri3 meshes, diaphragms, springs, imposed displacements and advanced loads remain rejected. |

## Current architecture decision

The React/TypeScript client is the shared source for both targets: it runs as a limited Vite web application and as the Tauri webview. The `model` module is renderer-independent; persistence dynamically imports Tauri APIs only when a Tauri host is present, keeping browser execution on web APIs. A future Python solver is a separate-process boundary, not a browser dependency.

M7 adds a renderer-independent `building` domain namespace to the versioned project model. Frame members created from grid intersections remain ordinary SI frame members, so the verified PyNite path is unchanged. Slabs and walls remain authoring geometry only and cause an explicit solver diagnostic rather than a frame approximation.

M7B extends this boundary without changing the validated frame solver input. Surface mesh nodes/elements are persisted with source signatures, and source edits make a mesh invalid until regenerated. DXF import maps DXF X/Y to STRUX X/Z and preserves DXF Z as STRUX +Y, after explicit source-unit conversion. It imports only linework as ordinary frame geometry and emits diagnostics for unsupported entities.

M7C adds deterministic constrained triangulation for validated internal slab openings. M7D changes the solver boundary only for validated quad4 meshes: it uses PyNiteFEA 3.2.1's inspected public `add_quad`/surface-pressure API and preserves its local axes in result provenance. PyNite has no public STRUX tri3 creation mapping, so every tri3 mesh is rejected as a whole-model diagnostic. Existing generated wall meshes are quad4; current constrained slab/opening meshes are tri3 and remain authoring-only.

Before adding a second independently released client, migrate this tree to explicit workspaces (`apps/web`, `apps/desktop`, `packages/structural-core`, `packages/ui`). That migration is intentionally deferred to avoid moving stable Phase 1 code solely for directory naming.

## M2 acceptance record

`M2_ACCEPTANCE.md` records the interactive-modeling behavior, validation evidence and non-goals. M3 input scope and validation are recorded in the milestone table and `TEST_REPORT.md`; no analysis scope is implied.

## Next eligible work

Obtain independent professor review of the Quad3D formulation, pressure sign/local-axis convention and B6/B7 benchmark assumptions. Then decide whether to add an independently verified triangular element/quad slab mesher before enabling opening slabs. Perform M7/M7B/M7C/M7D browser/Tauri visual regression for surface-pressure editing, deformation/table display and diagnostics, then complete M6 packaging validation. No analysis, design or report output may be represented as professionally verified until independent professor review and full license audit are complete.

## Repository notes

The verified M1 foundation and native-launch repair are committed on `main`. The M2 implementation and its evidence will be committed separately after final validation.
