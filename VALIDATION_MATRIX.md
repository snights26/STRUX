# STRUX Validation Matrix

| Area | Requirement | Evidence | Status |
|---|---|---|---|
| Model schema | Typed project has nodes, members, materials, sections, supports, load cases and nodal loads | `src/model/types.ts` | PASS |
| SI units | Storage uses m, N, Pa and kg/m³; UI conversion is presentation only | `types.ts`, `units.ts`, unit tests | PASS |
| Coordinates | Right-handed global X/Y/Z with +Y upward | `COORDINATE_CONVENTION`, test | PASS |
| Import safety | Version, shape and cross-reference validation reject invalid JSON | `serialization.ts`, `validation.ts`, tests | PASS |
| Model geometry | Members cannot join the same position | `validateProject`, test | PASS |
| History | Add/edit/delete actions can be undone/redone | reducer implementation | PARTIAL — no dedicated history tests |
| 3D model interaction | Create/select node/member/support/load | React/Three implementation | PARTIAL — no browser interaction tests |
| Engineering input | Materials, sections, support restraints and nodal loads | core data model and validation | PARTIAL — insufficient input types for FEM |
| Solver admissibility | Reject unsupported or invalid solver input | `NotImplementedSolverAdapter` rejects all analysis | PASS for Phase 1 only |
| Linear static solution | Reactions, displacements, member forces | No implementation | NOT STARTED |
| Numerical benchmark | Compare a textbook/independent benchmark | No implementation | NOT RUN |
| Results/reporting | Results schema, report output, traceability | No implementation | NOT STARTED |
| Offline web client | Build has no external font/network dependency | `styles.css`; Vite build | PASS |
| Tauri file access | Native dialog and read/write behavior | Source configuration only | NOT RUN |
| Windows package | Signed/installed `.exe` validated on Windows | No artifact | BLOCKED |
| License compliance | Dependency inventory and notice obligations reviewed | `LICENSE_AUDIT.md` | PARTIAL |
