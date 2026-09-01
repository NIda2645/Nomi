/**
 * Model-access journey script: relay-roundtrip
 *
 * Placeholder wired to the manifest (electron/shared/contracts/modelAccessCapabilities.ts +
 * manifest.mjs is the fact source). The executable roundtrip harness
 * (fixture-server / ui-driver / run-journeys / journey-cases) is delivered by the
 * model-access exhaustive-journeys change and replaces this body in place — this
 * file exists so manifest.test.mjs can assert a non-empty script per stable
 * roundtrip without pretending a real UI roundtrip already runs here.
 */
throw new Error(
  'relay-roundtrip.walk.mjs is a manifest placeholder; the executable roundtrip harness lands with the model-access journeys change.',
)
