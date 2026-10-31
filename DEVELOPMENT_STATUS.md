# STRUX Academic Research Edition — Development Status

**Status date:** 2026-10-31
**Evidence basis:** direct source audit plus local commands recorded in `TEST_REPORT.md`.
**Safety position:** research prototype only; never use it for safety-critical engineering decisions.

## Milestone status

| Milestone | Status | Evidence and boundary |
|---|---|---|
| M1 — Foundation and architecture | COMPLETE | Typed SI structural domain, validation/import boundary, undo/redo state, portable JSON, platform-file adapter, documented coordinate convention, test evidence, license inventory, and review documentation are present. A single shared React client is intentionally the current common source for web and Tauri; split workspaces are deferred until a second deployable app needs independent versioning. |
| M2 — Interactive 3D structural modeling | COMPLETE | The renderer now provides grid and exact-coordinate placement (including elevation), shift-selectable node sets, atomic numeric set transforms, member creation/editing, provisional local X/Y/Z visual axes with roll, node labels, and ISO/top/front/right camera presets. The model reducer has automated tests for the new transform undo/redo path and local-axis coordinate math; the acceptance record includes an isolated browser interaction check. These are visualization/authoring features only, not FEM conventions or analysis results. |
| M3 — Engineering data, loads and supports | PARTIAL | Materials/sections, restraint vectors, one default load case and global nodal force/moment loads exist. There is no load-case editor, combination engine, distributed/member load, imposed displacement, temperature load, release, self-weight or editable library manager. |
| M4 — PyNite FEM integration | BLOCKED | No Python runtime is installed on this machine; no PyNite dependency, solver bridge, solver input translator, benchmark, or numerical result exists. `SolverAdapter` deliberately rejects analysis. |
| M5 — Results and reporting | NOT STARTED | No calculated result schema, diagrams, tables, reports, or numerical benchmarks exist. `ReportAdapter` deliberately rejects reporting. |
| M6 — Windows desktop packaging and limited web | PARTIAL | Vite browser build passes; the Tauri 2 development host compiled and launched `strux.exe` after icon and local-port repair. Windows installer generation, installation, capability interaction and native file I/O remain NOT RUN. |

## Current architecture decision

The React/TypeScript client is the shared source for both targets: it runs as a limited Vite web application and as the Tauri webview. The `model` module is renderer-independent; persistence dynamically imports Tauri APIs only when a Tauri host is present, keeping browser execution on web APIs. A future Python solver is a separate-process boundary, not a browser dependency.

Before adding a second independently released client, migrate this tree to explicit workspaces (`apps/web`, `apps/desktop`, `packages/structural-core`, `packages/ui`). That migration is intentionally deferred to avoid moving stable Phase 1 code solely for directory naming.

## M2 acceptance record

`M2_ACCEPTANCE.md` records the implemented behavior, validation evidence and non-goals. The acceptance scope is limited to interactive modeling; it does not include loads/supports expansion, FEM solving, results, design or reporting.

## Next eligible work

M3 is the earliest incomplete milestone. Its remaining acceptance criteria must be documented before implementation begins. M4 must not begin until Python/PyNite installation and solver licensing are confirmed. No analysis, design or report work may be represented as calculated until M4 benchmarks pass.

## Repository notes

The verified M1 foundation and native-launch repair are committed on `main`. The M2 implementation and its evidence will be committed separately after final validation.
