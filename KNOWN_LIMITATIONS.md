# Known Limitations

## Engineering

- Linear elastic static analysis is available only through the isolated PyNiteFEA 3.2.1 runner and is **EXPERIMENTAL**. It has not received independent professor verification and must not be used for safety-critical decisions.
- Load combinations, member point/distributed loads, self-weight and releases are translated only within the verified M4 benchmark scope. Unsupported/unstable models must return no results.
- PyNiteFEA 3.2.1 `Quad3D` linear shell output is available only for current validated **quad4** surface meshes with mapped source material/thickness, existing six-DOF node supports and signed surface pressures. It is **EXPERIMENTAL**, not a validated design method.
- Generated M7C opening slabs are tri3 meshes. PyNiteFEA 3.2.1 has no inspected public STRUX tri3 creation API, so any tri3 surface mesh rejects the entire analysis. There is no quad conversion, frame approximation or silently omitted opening geometry.
- Surface supports are limited to ordinary STRUX analytical nodes that coincide with surface-mesh nodes. There is no separate mesh-node support, settlement, spring, diaphragm, eccentricity or rigid-link mapping.
- Quad3D reports local centre-point membrane stress, shear and bending resultants only. There are no stress contours, design envelopes, through-thickness stresses, nonlinear shell forces, cracking checks, reinforcement design or professor verification.
- Rigid/semi-rigid diaphragms, nodal springs, settlements, member end offsets, rigid links, thermal loads, imposed displacements, wind metadata and seismic metadata are validated input records only. The solver rejects a model containing any of them; wind/seismic definitions generate no forces and implement no code provision.
- Section catalogue geometry checks are mathematical consistency checks against entered SI properties; catalogue sources, provenance and design suitability are not independently verified.
- DXF import supports only ASCII LINE, LWPOLYLINE and basic POLYLINE linework. It does not import layers as properties, arcs, splines, blocks, dimensions, text, IFC/BIM semantics, supports, loads or a verified member catalogue.
- Storey grids are authoring references, not analytical constraints. There are no solver diaphragms, floor mass, automatic tributary loads, shell self-weight mapping, wall opening meshing, or automated design of building elements.
- Floor copying duplicates eligible floor members and connects/reuses target-storey nodes; it does not copy loads, supports, combinations, slabs, walls or design intent.
- Materials and sections are editable illustrative library records, not design-code verified catalogues. No catalogue, material, density or section property has been independently verified.
- No RCC, steel, timber or composite design check exists. Indian, American and European code support is not implemented.
- Displayed M5/M7D geometry, tables, diagrams and reports use actual runner output only. Frame B1 native flow was observed; M7D surface editor/deformation/table/error-display browser/native regression remains NOT RUN. A result is invalidated when its input hash or project revision changes.
- Local axes, roll, global/local member-load directions and end releases follow inspected PyNiteFEA 3.2.1 source conventions. Their correctness beyond B1–B5 needs independent review.
- No stress checks, code checks, nonlinear/P-Delta, modal, dynamic, seismic or buckling analysis is implemented. Results remain **EXPERIMENTAL** until independent review.

## Product / platform

- The native Tauri development executable launched successfully, but Cargo is not on the default process `PATH` on this host. Development-mode JSON open and the solver bridge were exercised; installer generation, installation, packaged resource paths and broad capability regression coverage remain unverified.
- Python 3.13.16 and PyNiteFEA 3.2.1 are used from the local `.venv`. The native Tauri process bridge solved the B1 fixture through the development executable, but remains development-path dependent; packaging it is out of scope.
- The browser client uses local storage plus JSON export/import; no cloud sync, collaboration, account system, encryption-at-rest or multi-user conflict handling exists.
- Browser interaction, accessibility and visual regression testing are not automated. M2 has a recorded isolated manual browser check only.
- M7 storey/grid/surface controls have targeted model and reducer coverage, but browser/Tauri visual interaction regression was not run by the M7 task scope.
- M7C mesh preview, DXF import and advanced-input editor interactions compile and have model-level command coverage, but browser/Tauri visual interaction regression was not run by scope.
- M7D Quad3D surface-pressure editing, shell deformation display, local-result tables and diagnostics compile and have protocol/model coverage, but browser/Tauri visual interaction regression was not run by scope.
- Three.js is the dominant web payload and currently produces a Vite chunk-size warning.
- IFC, BIM import/export, drawings, report templates and standards data are absent.

## Review requirements

A qualified structural engineering professor must independently review coordinate conventions, element formulation, loads, constraints, result units, benchmark models and code-design logic before any claim beyond a research prototype.
