# Known Limitations

## Engineering

- No stiffness assembly, finite-element solution, reactions, displacements, member force, stress, stability, modal, dynamic, seismic or nonlinear analysis is implemented.
- No load combinations, distributed/member loads, thermal loads, self-weight, releases, springs, diaphragms, slabs, shells or foundation elements are supported.
- Materials and sections are illustrative library records, not design-code verified catalogues.
- No RCC, steel, timber or composite design check exists. Indian, American and European code support is not implemented.
- `Analyze` and reporting intentionally state that functionality is unavailable. No displayed model object is an engineering result.
- No numerical benchmark has been executed. Any future solver output must remain **EXPERIMENTAL** until documented benchmarks pass.

## Product / platform

- The native Tauri development executable launched successfully, but Cargo is not on the default process `PATH` on this host. Installer generation, installation, capability interaction and native file I/O are still unverified.
- Python and PyNite are absent; the analysis backend is a documented boundary only.
- The browser client uses local storage plus JSON export/import; no cloud sync, collaboration, account system, encryption-at-rest or multi-user conflict handling exists.
- Browser interaction, accessibility and visual regression testing are not automated.
- Three.js is the dominant web payload and currently produces a Vite chunk-size warning.
- IFC, BIM import/export, drawings, report templates and standards data are absent.

## Review requirements

A qualified structural engineering professor must independently review coordinate conventions, element formulation, loads, constraints, result units, benchmark models and code-design logic before any claim beyond a research prototype.
