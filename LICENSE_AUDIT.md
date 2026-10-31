# Dependency License Audit

**Audit date:** 2026-10-31
**Method:** local inspection of the committed `package-lock.json`; no registry data or package terms were inferred.

## Direct npm dependencies

| Package | Locked version | Lockfile license expression |
|---|---:|---|
| `@react-three/fiber` | 9.8.2 | MIT |
| `@tauri-apps/api` | 2.12.4 | Apache-2.0 OR MIT |
| `@tauri-apps/cli` | 2.12.4 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-dialog` | 2.8.4 | MIT OR Apache-2.0 |
| `@tauri-apps/plugin-fs` | 2.7.1 | MIT OR Apache-2.0 |
| `react`, `react-dom` | 19.3.1 | MIT |
| `three`, `@types/three` | 0.181.2 / 0.181.0 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| Vite, Vitest, React Vite plugin and React types | locked in `package-lock.json` | MIT |

## Transitive npm lockfile inventory

The lockfile reports 181 package records with declared expressions: 152 MIT, 4 Apache-2.0, 13 Apache-2.0 OR MIT, 2 MIT OR Apache-2.0, 3 BSD-3-Clause, 6 ISC and 1 CC-BY-4.0. The CC-BY-4.0 record is `caniuse-lite`, a transitive development dependency beneath `browserslist`.

## Packaging decision

**NOT APPROVED FOR DISTRIBUTION YET.** The JavaScript inventory is permissive on its face, but this is not legal advice or a full notice-file audit. Before creating an installer, resolve and record Rust crate versions/licenses in `Cargo.lock`, generate third-party notices for npm and Cargo dependencies, review Tauri distribution terms, and verify the final package contains required notices.

PyNite and optional OpenSeesPy are not installed, so their licenses are not audited here. Adding either requires a new audit before distribution.
