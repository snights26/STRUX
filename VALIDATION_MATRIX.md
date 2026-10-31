# STRUX Validation Matrix

| Area | Requirement | Evidence | Status |
|---|---|---|---|
| Model schema | Typed schema-v4 project has frame data, libraries, engineering loads/supports/releases, building data and extended modeling inputs | `src/model/types.ts`, V1→V2→V3→V4 migration tests | PASS |
| SI units | Storage uses m, N, Pa and kg/m³; UI conversion is presentation only | `types.ts`, `units.ts`, unit tests | PASS |
| Coordinates | Right-handed global X/Y/Z with +Y upward | `COORDINATE_CONVENTION`, test | PASS |
| Multi-view CAD planes | Top X–Z/Y offset, Front X–Y/Z offset, Side Z–Y/X offset; in-plane snap and plane-constrained placement | `modelingPlane.ts`, targeted pure mapping/camera/history tests | PASS — native visual regression coverage remains incomplete |
| Import safety | Version, shape and cross-reference validation reject invalid JSON | `serialization.ts`, `validation.ts`, tests | PASS |
| Model geometry | Members cannot join the same position | `validateProject`, test | PASS |
| History | M2 node-set transform is a single undo/redo action | `historyReducer` test | PASS — M2 transform path is covered; broad history-regression coverage remains incomplete |
| 3D model interaction | Place/select/edit nodes and members, camera presets and labels | React/Three implementation; isolated browser check recorded in `TEST_REPORT.md` | PASS — manual browser evidence; automated E2E remains NOT RUN |
| Exact coordinates | Entered coordinates remain SI model coordinates, including elevation | UI conversion boundary; isolated browser check | PASS |
| Member display axes | Right-handed provisional local X/Y/Z axes and roll visualization | `calculateMemberLocalAxes` test; selected-member viewport | PASS — display convention only; not admitted to any solver |
| Node sets | Shift selection in the viewport and atomic numeric translation | `App.tsx`, `Inspector.tsx`, reducer undo/redo test | PASS — browser canvas set-selection lacks automated E2E coverage |
| Storeys and grids | Ground/typical/roof elevations; editable X/Z lines and deterministic intersections | `building.ts`, reducer/validation tests | PASS — automated domain coverage; visual workflow NOT RUN |
| Building frame authoring | Grid-connected columns/beams, floor-member copying, floor selection and visibility/isolation controls | `reducer.ts`, `App.tsx`, `Viewport.tsx`, M7 unit tests | PASS — generated members are ordinary frame members; visual workflow NOT RUN |
| Slab and wall authoring | Polygonal slab outlines/openings and storey-height structural wall geometry validate references and plan geometry | `validation.ts`, `building.test.ts` | PASS — MODELING ONLY; no shell/plate analysis |
| Building deletion/history | Referenced surface nodes are protected; storey actions are undoable | `reducer.ts`, `building.test.ts` | PASS — automated reducer coverage |
| Surface mesh authoring | Deterministic constrained slab triangulation/refinement around one or more internal openings and wall quad meshing; source signatures invalidate stale meshes | `mesh.ts`, M7B/M7C tests | PASS — generated opening slabs are tri3 authoring data; generated walls are quad4 |
| Mesh quality | Element topology, duplicate IDs, degeneracy, planarity, connectivity, opening exclusion, aspect-ratio threshold and density limits | `checkMeshQuality`, `checkSlabOpeningConstraints`, M7C tests | PASS — authoring validation only |
| Diaphragms | Rigid/semi-rigid metadata and same-storey node/slab assignment validation | schema-v4 validation and M7B tests | PASS — solver constraint mapping rejected |
| Foundation inputs | Six-DOF nodal spring stiffness and settlement declarations with SI validation | schema-v4 validation and M7B tests | PASS — solver mapping rejected |
| Extended frame/load inputs | Global member offsets, rigid links, thermal/imposed/wind/seismic declarations | schema-v4 validation and M7B tests | PASS — input only; no load generation or solver mapping |
| Section catalogue | Explicit SI geometry/property units and provenance; rectangular/circular/I-section property consistency checks | `validation.ts`, M7B tests | PASS — source data is not independently certified |
| DXF analytical import | ASCII LINE/LWPOLYLINE/POLYLINE, $INSUNITS conversion, XY→XZ/Y-up mapping, duplicate filtering and diagnostics | `import/dxf.ts`, M7B tests | PASS — limited entity set; imported geometry is ordinary frame authoring data |
| Engineering input | Load cases/combinations, editable libraries, six-DOF restraints, releases, nodal/member/self-weight loads and directions | model validation and 21-test unit suite | PASS — validated input only; no solver translation or calculation |
| Solver admissibility | Versioned SI v2 translation rejects invalid/unknown/unstable inputs and binds results to the input hash/project revision | `translateProject`, isolated PyNite runner tests | PASS — EXPERIMENTAL |
| M7B solver admission | Tri3 meshes, diaphragms, foundation/rigid connectivity and advanced loads emit explicit no-analysis diagnostics | `translateProject`, M7B rejection test | PASS — unsupported data is never silently omitted |
| M7D Quad3D admission | Current quad4 meshes map deterministically to PyNite Quad3D with source material/thickness, shared SI node mapping, six-DOF support mapping and signed local-normal pressure | solver-input v2 translator/runner, `surfaceTranslateProject.test.ts` | PASS — EXPERIMENTAL; tri3 is rejected |
| M7D numerical verification | B6 clamped-square plate/reference displacement/refinement/equilibrium; B7 membrane stress patch/reaction; B8 invalid/singular rejection | `tests/test_pynite_surface_runner.py` | PASS — EXPERIMENTAL; documented 3% B6 displacement tolerance |
| M7C authoring UI | Inspector/model tree/viewport expose mesh preview, M7B data editors, catalogue metadata and DXF import | React implementation; TypeScript compile | PARTIAL — browser/Tauri interaction regression NOT RUN by scope |
| Linear static solution | Reactions, displacements, member force samples | PyNiteFEA 3.2.1 B1–B5 targeted runner suite; native B1 bridge | PASS — EXPERIMENTAL |
| Numerical benchmark | Analytical B1–B4; independent linearity/equilibrium B5 | `tests/test_pynite_runner.py` | PASS — EXPERIMENTAL |
| Results/reporting | Provenance, frame tables/diagrams, Quad3D local-result table, deformed frame/surface geometry and HTML/PDF summary | Result/report contracts; TypeScript/report tests; native B1 table/overlay observation | PARTIAL — EXPERIMENTAL; M7D browser/native visual/export E2E remains NOT RUN |
| Offline web client | Build has no external font/network dependency | `styles.css`; Vite build | PASS |
| Tauri file access / Python bridge | Native dialog, file import and isolated Python command | Native B1 fixture opened and solved through `run_pynite_analysis` | PASS — EXPERIMENTAL; native post-fix error-display recheck NOT RUN |
| Windows package | Signed/installed `.exe` validated on Windows | No artifact | BLOCKED |
| License compliance | Dependency inventory and notice obligations reviewed | `LICENSE_AUDIT.md` | PARTIAL |
