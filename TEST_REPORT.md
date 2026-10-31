# STRUX Test Report

**Executed on:** 2026-10-31
**Host:** Windows; Node.js/npm available; Rust is installed at `C:\Users\darsh\.cargo\bin` but is not on the process `PATH`; Python/PyNite unavailable.

| Check | Command | Actual result | Coverage / note |
|---|---|---|---|
| Model unit suite | `npm test` | PASS — 1 file, 12 tests | Coordinates, grid snapping, dependent deletion, serialization round-trip, schema rejection, malformed entity rejection, zero-length member rejection, coordinate convention, unit conversion and non-finite load validation. |
| TypeScript and web production build | `npm run build` | PASS | `tsc -b` succeeded; Vite emitted `dist/`. Vite warns that the Three.js bundle exceeds 500 kB (1,170.30 kB raw / 328.35 kB gzip). |
| Tauri icon assets | `npx tauri icon src-tauri/icons/icon.svg` plus structural ICO check | PASS | Original SVG produced standard multi-resolution assets. `icon.ico` is 16,929 bytes with six valid embedded images; all configured bundle paths exist. |
| Tauri development host | `npx tauri dev` with the existing Cargo directory added for that process only | PASS | Vite started at `127.0.0.1:5174`; Cargo completed the dev compilation and launched `target\\debug\\strux.exe`. The running process was observed, then the development session was stopped cleanly. |
| Windows installer / `.exe` | `npx tauri build` | NOT RUN | Development executable only; installer generation and installation are outside this verified repair. |
| Python environment | `python --version`, `py --version` | NOT RUN | Commands are unavailable / blocked by Windows app alias; PyNite is not installed. |
| PyNite numerical benchmarks | N/A | NOT RUN | Solver integration does not exist. |
| Browser interaction / visual E2E | N/A | NOT RUN | There is no browser E2E test framework or CI browser harness. |
| License lockfile inventory | Node inspection of `package-lock.json` | PASS with follow-up required | 181 package records declare licenses. Direct npm dependencies are permissive; see `LICENSE_AUDIT.md`. `Cargo.lock` now pins Rust dependencies, but Rust license inventory is not audited. |

## Test integrity

Only commands shown above are claimed as executed. A passing TypeScript/web build does not validate native Tauri packaging, engineering calculations, browser interaction correctness, or professional engineering suitability.
