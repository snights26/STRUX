# Professor Review Guide

## Purpose

STRUX is an academic research prototype. This guide supports an independent review; it does not assert that the software is suitable for professional design.

## Current reviewable scope

- Project data model, SI units, JSON validation, coordinate convention, node/member connectivity, support restraint storage and global nodal loads.
- Three.js visualization and authoring workflow only.
- No FEM results are available for technical acceptance.

## Required checks before FEM acceptance

1. Confirm the global system is right-handed with +Y upward and all stored values use SI units.
2. Review every solver translation rule from `Project` into the chosen FEM engine.
3. Review degree-of-freedom ordering, restraint mapping, local member axes, roll angle, releases and sign conventions.
4. Approve benchmark definitions before solver implementation is called verified.
5. Independently reproduce each benchmark and compare inputs, reactions, displacement and member-end actions with documented tolerances.
6. Review all error/rejection paths for incomplete or physically inadmissible models.

## Planned benchmark register

| ID | Model | Expected evidence | Current status |
|---|---|---|---|
| B1 | Axially loaded bar | Displacement and reaction | NOT IMPLEMENTED |
| B2 | Simply supported beam with point load | Reactions, shear/moment and deflection | NOT IMPLEMENTED |
| B3 | Cantilever with point load | Tip displacement, rotation and moment | NOT IMPLEMENTED |
| B4 | Stable 2D portal frame | Nodal displacements and member end actions | NOT IMPLEMENTED |
| B5 | Constraint rejection cases | Clear no-result diagnostics | PARTIAL — generic analysis rejection only |

## Evidence to request at each later milestone

- Versioned benchmark input JSON.
- Solver/version manifest and reproducible command.
- Independent hand or trusted-program calculation.
- Machine-readable result JSON containing an input hash.
- Automated test logs and tolerance justification.
- Updated limitations, license audit and this guide.
