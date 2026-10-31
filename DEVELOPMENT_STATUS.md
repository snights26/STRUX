# STRUX Academic Research Edition — Development Status

**Status date:** 2026-10-31
**Evidence basis:** direct source audit plus local commands recorded in `TEST_REPORT.md`.
**Safety position:** research prototype only; never use it for safety-critical engineering decisions.

## Milestone status

| Milestone | Status | Evidence and boundary |
|---|---|---|
| M1 — Foundation and architecture | COMPLETE | Typed SI structural domain, validation/import boundary, undo/redo state, portable JSON, platform-file adapter, documented coordinate convention, test evidence, license inventory, and review documentation are present. A single shared React client is intentionally the current common source for web and Tauri; split workspaces are deferred until a second deployable app needs independent versioning. |
| M2 — Interactive 3D structural modeling | PARTIAL | 3D orbit viewport, grid-snapped node placement, two-node member creation, selection, deletion and property editing exist. Transforms, elevation placement in-view, selection sets, member axes, camera presets, labels and browser interaction tests are absent. |
| M3 — Engineering data, loads and supports | PARTIAL | Materials/sections, restraint vectors, one default load case and global nodal force/moment loads exist. There is no load-case editor, combination engine, distributed/member load, imposed displacement, temperature load, release, self-weight or editable library manager. |
| M4 — PyNite FEM integration | BLOCKED | No Python runtime is installed on this machine; no PyNite dependency, solver bridge, solver input translator, benchmark, or numerical result exists. `SolverAdapter` deliberately rejects analysis. |
| M5 — Results and reporting | NOT STARTED | No calculated result schema, diagrams, tables, reports, or numerical benchmarks exist. `ReportAdapter` deliberately rejects reporting. |
| M6 — Windows desktop packaging and limited web | PARTIAL | Vite browser build passes; a Tauri 2 Rust shell and native file-dialog adapters are committed. Rust/Cargo is unavailable, so `tauri dev`, Windows `.exe`, installer, capability verification and native file I/O remain NOT RUN. |

## Current architecture decision

The React/TypeScript client is the shared source for both targets: it runs as a limited Vite web application and as the Tauri webview. The `model` module is renderer-independent; persistence dynamically imports Tauri APIs only when a Tauri host is present, keeping browser execution on web APIs. A future Python solver is a separate-process boundary, not a browser dependency.

Before adding a second independently released client, migrate this tree to explicit workspaces (`apps/web`, `apps/desktop`, `packages/structural-core`, `packages/ui`). That migration is intentionally deferred to avoid moving stable Phase 1 code solely for directory naming.

## Next eligible work

M2 and M3 can proceed in parallel only after a written acceptance criterion is added for each feature. M4 must not begin until Python/PyNite installation and solver licensing are confirmed. No analysis, design or report work may be represented as calculated until M4 benchmarks pass.

## Repository notes

This directory has no `.git` metadata, so no commit was created. Source changes and verification evidence are present in the working tree.
