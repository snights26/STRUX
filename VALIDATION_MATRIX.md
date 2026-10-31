# STRUX Validation Matrix

| Area | Requirement | Evidence | Status |
|---|---|---|---|
| Model schema | Typed project has nodes, members, materials, sections, supports, load cases and nodal loads | `src/model/types.ts` | PASS |
| SI units | Storage uses m, N, Pa and kg/m³; UI conversion is presentation only | `types.ts`, `units.ts`, unit tests | PASS |
| Coordinates | Right-handed global X/Y/Z with +Y upward | `COORDINATE_CONVENTION`, test | PASS |
| Import safety | Version, shape and cross-reference validation reject invalid JSON | `serialization.ts`, `validation.ts`, tests | PASS |
| Model geometry | Members cannot join the same position | `validateProject`, test | PASS |
| History | M2 node-set transform is a single undo/redo action | `historyReducer` test | PASS — M2 transform path is covered; broad history-regression coverage remains incomplete |
| 3D model interaction | Place/select/edit nodes and members, camera presets and labels | React/Three implementation; isolated browser check recorded in `TEST_REPORT.md` | PASS — manual browser evidence; automated E2E remains NOT RUN |
| Exact coordinates | Entered coordinates remain SI model coordinates, including elevation | UI conversion boundary; isolated browser check | PASS |
| Member display axes | Right-handed provisional local X/Y/Z axes and roll visualization | `calculateMemberLocalAxes` test; selected-member viewport | PASS — display convention only; not admitted to any solver |
| Node sets | Shift selection in the viewport and atomic numeric translation | `App.tsx`, `Inspector.tsx`, reducer undo/redo test | PASS — browser canvas set-selection lacks automated E2E coverage |
| Engineering input | Materials, sections, support restraints and nodal loads | core data model and validation | PARTIAL — insufficient input types for FEM |
| Solver admissibility | Reject unsupported or invalid solver input | `NotImplementedSolverAdapter` rejects all analysis | PASS for Phase 1 only |
| Linear static solution | Reactions, displacements, member forces | No implementation | NOT STARTED |
| Numerical benchmark | Compare a textbook/independent benchmark | No implementation | NOT RUN |
| Results/reporting | Results schema, report output, traceability | No implementation | NOT STARTED |
| Offline web client | Build has no external font/network dependency | `styles.css`; Vite build | PASS |
| Tauri file access | Native dialog and read/write behavior | Source configuration only | NOT RUN |
| Windows package | Signed/installed `.exe` validated on Windows | No artifact | BLOCKED |
| License compliance | Dependency inventory and notice obligations reviewed | `LICENSE_AUDIT.md` | PARTIAL |
