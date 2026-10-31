# Future analysis backend boundary

Phase 1 does not install PyNite or execute any calculations. The eventual backend should run as a separate Python process and expose a narrow, versioned request/response interface:

1. Receive validated `Project` JSON and a selected load case or combination.
2. Convert the stable SI model into PyNite inputs in an adapter owned by this process.
3. Return a typed result payload with the input-project hash, solver version, messages, convergence state, and results.
4. Never write results into the model unless the request is complete, valid, and traceable.

The UI-side `src/solver/SolverAdapter.ts` is the corresponding TypeScript seam. It deliberately throws in Phase 1 so no placeholder reaction, displacement, force, or design value can be mistaken for an engineering result.
