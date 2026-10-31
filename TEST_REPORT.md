# STRUX Test Report

**Executed on:** 2026-10-31
**Host:** Windows; Node.js/npm available; Rust is installed at `C:\Users\darsh\.cargo\bin` but is not on the process `PATH`; Python/PyNite unavailable.

| Check | Command | Actual result | Coverage / note |
|---|---|---|---|
| Model unit suite | `npm test` | PASS — 1 file, 15 tests | Final run completed in 1.33 s. Covers coordinates, grid snapping, atomic node-set translate undo/redo, right-handed provisional member axes, dependent deletion, serialization round-trip, schema rejection, malformed entity rejection, zero-length member rejection, coordinate convention, unit conversion and non-finite load validation. |
| TypeScript and web production build | `npm run build` | PASS | `tsc -b` succeeded; Vite emitted `dist/`. Final M2 build was 1,179.78 kB raw / 331.56 kB gzip for the Three.js chunk, so Vite emitted its standard >500 kB warning. |
| Tauri icon assets | `npx tauri icon src-tauri/icons/icon.svg` plus structural ICO check | PASS | Original SVG produced standard multi-resolution assets. `icon.ico` is 16,929 bytes with six valid embedded images; all configured bundle paths exist. |
| Tauri development host | `npx tauri dev` with the existing Cargo directory added for that process only | PASS | Re-verified after M2: Vite started at the unchanged `127.0.0.1:5174`; Cargo completed the dev compilation and launched `target\\debug\\strux.exe`. The verification session was then stopped cleanly. |
| Windows installer / `.exe` | `npx tauri build` | NOT RUN | Development executable only; installer generation and installation are outside this verified repair. |
| Python environment | `python --version`, `py --version` | NOT RUN | Commands are unavailable / blocked by Windows app alias; PyNite is not installed. |
| PyNite numerical benchmarks | N/A | NOT RUN | Solver integration does not exist. |
| M2 isolated browser interaction | Local `http://127.0.0.1:5174/` Vite host | PASS — manual | Created N1 `(0,0,0)`, N2 `(0,4,0)` and N3 `(4,0,0)` through exact entry; created M1 `N1 → N3`; selected the member; changed its display roll to `90°`; verified the top-camera preset and labels visibility toggle. No browser E2E framework or CI harness exists. |
| Browser interaction / visual E2E | N/A | NOT RUN | Automated browser E2E coverage has not been added; the preceding row is an observed manual check, not an automated test. |
| License lockfile inventory | Node inspection of `package-lock.json` | PASS with follow-up required | 181 package records declare licenses. Direct npm dependencies are permissive; see `LICENSE_AUDIT.md`. `Cargo.lock` now pins Rust dependencies, but Rust license inventory is not audited. |

## Test integrity

Only commands shown above are claimed as executed. One sandboxed final `npm test` attempt failed before test discovery with a Windows temporary-cache `EPERM` rename error; the same command was immediately re-run using the normal local Windows cache and passed as recorded. A passing TypeScript/web build does not validate native Tauri packaging, engineering calculations, browser interaction correctness, or professional engineering suitability.
