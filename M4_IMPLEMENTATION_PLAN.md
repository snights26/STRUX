# M4 Preparation — PyNite Linear Static FEM

**Status:** M4A/M4B implemented; M7D adds limited Quad3D surface analysis. All outputs are **EXPERIMENTAL**. Professor verification and PyNite license review remain required.

## Current boundary

`src/solver/contracts.ts` defines versioned solver-input/result contracts. `src/solver/translateProject.ts` is a pure schema-v4-to-solver-input-v2 translator with deterministic entity names and input fingerprinting. `src/solver/python/strux_pynite_runner.py` is an isolated stdin/stdout JSON runner. The React client invokes it only through the Tauri command and discards a result whose hash or project revision differs.

## Verified PyNiteFEA 3.2.1 facts

- Distribution: `PyNiteFEA 3.2.1`; canonical import module: `Pynite`.
- `FEModel3D` accepts X/Y/Z nodes, `DX/DY/DZ/RX/RY/RZ` supports, global nodal directions `FX/FY/FZ/MX/MY/MZ`, and local/global member directions using lower/upper case respectively.
- Section API is `(A, Iy, Iz, J)`; member rotation is degrees about local X. STRUX radians are converted at the runner boundary.
- `def_releases` accepts local `[Dx, Dy, Dz, Rx, Ry, Rz]` at start then end. The renderer's local-axis construction now matches PyNite's source transformation, including vertical members.
- Inspected public surface API: `add_quad(name, i, j, m, n, t, material)`, `add_quad_surface_pressure`, and Quad3D local `moment`, `shear`, and `membrane` result methods. Quad3D has 24 element DOFs (six global nodal DOFs at four nodes); local X is i→j and local Z follows the source cross-product convention.
- `add_plate` exists for rectangular plates but was not mapped; the installed public `FEModel3D` API has no `add_tri` method. STRUX tri3 meshes are therefore explicitly rejected rather than converted or guessed.

## Required mapping contract

| STRUX v2 input | Implemented M4 mapping |
|---|---|
| Node | Stable ID-sorted `N_####`; `(x, y, z)` in metres without axis swapping. |
| Material | `E` in Pa; derives `G = E / (2(1+ν))`; density remains kg/m³. |
| Section/member | Maps `A` (m²), `Iy`, `Iz`, `J` (m⁴), endpoints, degree roll and all 12 verified local release DOFs. |
| Support | Maps `[UX, UY, UZ, RX, RY, RZ]` to PyNite `DX/DY/DZ/RX/RY/RZ` one-for-one. |
| Nodal load | Maps `[Fx, Fy, Fz, Mx, My, Mz]` in N and N·m to its named load case. |
| Member point load | Converts normalized position to local `x` in m; maps N magnitude and verified global/local direction. |
| Distributed load | Maps start/end N/m intensity and verified global/local direction. |
| Self weight | Expands once into `density × area × 9.80665 × factor` global distributed load; no engine self-weight API is also called. |
| Combination | Creates isolated named engine combinations and returns results by STRUX case/combination ID. |
| End releases | Maps verified local release order; unstable released models return no-result diagnostics. |
| Quad3D surface | Maps only validated quad4 mesh nodes/elements, source thickness/material, shared SI-coordinate nodes, six-DOF supports and signed Pa surface pressure. Returns actual node displacements plus local membrane stress, shear and moment resultants. |

## Conventions to freeze before implementation

- Internal units are SI: m, N, N·m, Pa, m², m⁴, kg/m³, and N/m. Display-unit settings never enter the solver payload.
- Global axes are right-handed, with +Y upward. Positive force/moment components use the stored global component sign.
- DOF order is `[UX, UY, UZ, RX, RY, RZ]`; translational displacement output is m and rotational output is rad.
- M2's display local axes/roll are **not** yet a solver convention. Pin and test the PyNite member local-axis, roll, inertia and release conventions before enabling local loads.
- For Quad3D, local X runs i→j and local Z is returned with each result. STRUX does not transform signed pressure to a global direction; positive pressure follows the verified PyNite local +Z result convention.
- Use one deterministic ID-to-solver-name map per run and retain it with the run manifest.

## Unsupported/risk register

- PyNite license audit is still incomplete. The Python path is development-only (`.venv`) and is not packaged.
- The Tauri process bridge is uncompiled/unlaunched in this milestone; native runtime behavior is NOT RUN.
- No imposed displacement, temperature, springs, diaphragms, tri3 shells, nonlinear/stability/modal/dynamic/seismic analysis, member design, load envelopes or IFC mapping may enter the verified solver scope.
- Self weight risks duplicate gravity application; combinations risk incorrect case identity/factor handling. Both require explicit tests.
- Unstable/mechanism models, singular stiffness matrices and unsupported fields must produce actionable no-result diagnostics.
- Tauri packaging of Python is out of scope; M4 development uses an isolated local process only after separate approval.

## Independent benchmark register

All benchmark JSON, hand/trusted-solver baseline, tolerance and solver-version manifest must be committed before calling M4 verified.

| ID | Model / input | Acceptance quantity |
|---|---|---|
| B1 | 3 m axial bar: `E=200 GPa`, `A=0.01 m²`, +100 kN axial end load. | PASS — `u = PL/AE = 0.000150 m`; reaction magnitude 100 kN; force equilibrium. |
| B2 | 4 m cantilever, `Iz=8e-6 m⁴`, −10 kN global-Y tip load. | PASS — tip `|DY| = 0.133333 m`, `|RZ| = 0.050000 rad`, reaction moment magnitude 40 kN·m. |
| B3 | 6 m simply supported/released beam, −5 kN/m UDL. | PASS — 15 kN reactions, `|DYmid| = 0.0527344 m`, `|Mz|max = 22.5 kN·m`. |
| B4 | 6 m simply supported/released beam, −12 kN midpoint point load. | PASS — 6 kN reactions, `|DYmid| = 0.0337500 m`, `|Mz|max = 18 kN·m`. |
| B5 | Stable one-bay portal, dead/live cases and `1.2D+1.6L` combination. | PASS — independent linear superposition and global X/Y force-equilibrium checks. |
| B6 | 1 m clamped square plate, `E=210 GPa`, `ν=0.30`, `t=20 mm`, 1 kPa pressure; 4×4 and 16×16 Quad3D meshes. | PASS — 16×16 centre displacement within 3% of `0.001265319 qa⁴/D`; pressure/reaction equilibrium; refinement improves error. |
| B7 | 2 m × 1 m Quad3D membrane patch, `t=10 mm`, 100 kN uniform edge traction. | PASS — local `Sx = P/(tb) = 10 MPa`; X reaction equilibrium. |
| B8 | Malformed quad connectivity and unrestrained shell mesh. | PASS — rejected/error no-result payloads; no fabricated results. |

Signs for local actions and member-end forces are deliberately not specified until the pinned-engine convention is independently checked. B1–B4 magnitudes do not authorize a sign convention.

## M4A — translator and isolation checklist

1. DONE — pinned Python 3.13.16/PyNiteFEA 3.2.1 source APIs and JSON process protocol.
2. DONE — versioned contracts, input hash/revision provenance, diagnostics and no-result states.
3. DONE — pure translation/rejection tests for references, units, directions, releases and extensions.
4. DONE — nodes/materials/sections/members/restraints/loads/releases/combinations checked against installed source.
5. DONE — isolated runner and timeout-capable Tauri bridge; native bridge verification remains NOT RUN.

## M4B — verified linear-static checklist

1. DONE — B1–B5 are executable Python fixtures with analytical or independent linearity/equilibrium references.
2. DONE — targeted tests assert mappings, displacements, reactions and member force samples.
3. DONE — bad directions and singular models produce rejected/error no-result payloads.
4. PARTIAL — Python/PyNite versions and local evidence recorded; professor review and license audit remain pending.
5. DONE — M5 consumes provenance-checked results as EXPERIMENTAL only.
