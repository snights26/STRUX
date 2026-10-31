# M2 Acceptance Record — Interactive 3D Structural Modeling

**Status date:** 2026-10-31
**Milestone status:** COMPLETE within the research-prototype scope below.

## Implemented acceptance scope

- Nodes can be placed on the X/Z grid and entered at exact X/Y/Z coordinates. Values cross the UI boundary in the selected display units and are stored as SI metres.
- The viewport supports node and member selection, two-node member creation, property editing, node labels and ISO/top/front/right presets.
- Holding Shift while selecting nodes in the viewport creates a node selection set. The inspector applies one numeric translation delta to the selected nodes as one undoable model action.
- Selected members display provisional local X/Y/Z glyphs. A member roll angle can be edited in degrees for that visualization.
- The structural model, renderer, UI and existing solver/report adapters remain separate. No M3 input expansion or solver/results work was started.

## Evidence

| Evidence | Actual result |
|---|---|
| `npm test` | PASS — 1 Vitest file, 15 tests. Includes M2 translate undo/redo and right-handed local-axis math. |
| `npm run build` | PASS — TypeScript project build and Vite production build completed. |
| Isolated browser interaction | PASS — local Vite host created exact-coordinate nodes `(0,0,0)`, `(0,4,0)`, `(4,0,0)`, made member `N1 → N3`, selected it, edited visual roll to `90°`, used top view, and toggled labels. |
| Native Tauri launch | PASS — after final source validation, the unchanged Tauri configuration started Vite at `127.0.0.1:5174`, compiled and launched `target\\debug\\strux.exe`; the verification session was stopped cleanly. |

## Explicit non-goals and safeguards

- Local member axes are not a solver convention and have no analysis/design meaning at this stage.
- There are no calculated reactions, displacements, forces, stresses, design checks or reports.
- Browser interaction is a recorded manual check. Automated browser E2E, accessibility and visual-regression coverage are still NOT RUN.
- M3 remains the earliest incomplete milestone. This record does not authorize M3 work.
