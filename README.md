# STRUX — Academic Research Edition

STRUX is a lightweight, offline-first structural-modeling research prototype. The shared React client is usable as a limited browser application and is prepared for a Tauri desktop host. It implements Phase 1 authoring only; it **does not calculate, display, or imply structural analysis or design results**.

## What is included

- CAD-like React/Three.js workspace with a scalable X–Z ground grid, 3D orbit camera, labels, and ISO/top/front/right view presets.
- Grid or exact-coordinate node placement, node-set numeric transforms, selectable beam/column/brace members, supports, and nodal loads.
- Built-in compact steel/concrete material and section libraries, with references stored by ID.
- Metric/imperial display units while values remain in SI base units in the model.
- Model tree, contextual property inspector, model checks, undo/redo, local autosave, and JSON import/export.
- Tauri 2 project shell, including native dialog/file plugin integration for desktop save/open when the native host is available.
- Typed, versioned project schema designed to grow into load combinations, finite elements, plates/slabs, result sets, code design, reporting, and IFC mappings.
- Unit tests for coordinates, local display axes, transform undo/redo, relationships, unit conversion, serialization, and load validation.

## Architecture

```
src/
  model/          canonical structural schema, commands/history, libraries, units, validation
  renderer/       Three.js scene only — no engineering business logic
  ui/             model tree and property forms
  persistence/    local/JSON project boundary (web fallback + lazily-loaded Tauri desktop files)
  solver/         future Python/PyNite process contract; intentionally throws in Phase 1
  reporting/      future reporting contract; intentionally throws in Phase 1
src-tauri/        minimal Tauri 2 host and explicit desktop capabilities
```

The browser UI never talks directly to a solver. `SolverAdapter` is the intentional seam for a future isolated Python worker/process that can validate and transform `Project` data into a PyNite-compatible input, return typed result sets, and preserve an auditable calculation boundary. The canonical coordinate system is right-handed global X/Y/Z with positive Y upward; all model values are stored in SI units.

## Run it

Prerequisites: Node.js 20+ and npm. For desktop packaging, also install Rust and platform prerequisites from the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm install
npm run dev
```

To run the desktop host after Rust is installed:

```powershell
npx tauri dev
```

`cargo` must be available on your process `PATH`. This host has Rust installed under `%USERPROFILE%\.cargo\bin`; add that directory to `PATH` before invoking Tauri in a new terminal. The development client uses `http://127.0.0.1:5174` for its local Vite server.

Quality checks:

```powershell
npm test
npm run build
```

## Modeling notes

- Use **Node** then click the grid to add a ground-level node, or enter an exact X/Y/Z location in the node panel.
- Use **Member** then select start and end nodes. Select a member to see provisional display axes and edit its visual roll; these are not solver axes.
- Shift-click nodes in the viewport to make a selection set, then use the inspector's numeric delta fields to translate them as one undoable action.
- Use **Support** or **Nodal Load** then select a node. Supports initially use a pinned condition; loads start at −10 kN in global Y and can be edited.
- Stored project data always uses metres, newtons, and pascals. Changing units only changes presentation.
- `Save JSON` produces a portable, versioned `.strux.json` file. The app also keeps a local autosave in its webview storage.

## Phase 1 boundary

This is a modeling prototype, not production engineering software. It does not implement stiffness assembly, load combinations, analysis, code checks, detailing, drawing production, collaboration, security review, or IFC import/export. Do not use it to make safety-critical decisions.

## Research evidence

- [Development status](DEVELOPMENT_STATUS.md)
- [Actual test report](TEST_REPORT.md)
- [Validation matrix](VALIDATION_MATRIX.md)
- [Known limitations](KNOWN_LIMITATIONS.md)
- [Dependency license audit](LICENSE_AUDIT.md)
- [Professor review guide](PROFESSOR_REVIEW_GUIDE.md)
