import { createGenerationProviderBootstrap, type GenerationProviderBootstrap } from "./generationProviderBootstrap";
import { createCatalogModuleRegistry } from "./moduleCatalogBootstrap";
import type { ModuleRegistry, ModuleResolveInput, ResolvedModule } from "./moduleRegistry";
import { readCatalog } from "../catalog/catalogStore";
import type { CatalogState } from "../catalog/types";

export type LiveGenerationRegistry = Pick<ModuleRegistry, "resolve"> & Partial<Pick<ModuleRegistry, "snapshot">>;

export type LiveGenerationRuntimeScope = Readonly<{
  /** The immutable provider/readiness view captured for this planning call. */
  readBootstrap: () => GenerationProviderBootstrap;
  /** The immutable catalog-derived module registry captured for this planning call. */
  registry: LiveGenerationRegistry;
}>;

/**
 * Runtime view of the generation catalog.
 *
 * Settings writes are allowed while the desktop process is alive.  A provider
 * list captured during app startup therefore becomes stale exactly when a user
 * enters a new APIMart key.  This seam re-reads the catalog at operation
 * boundaries; it does not mutate a running request or churn the tool schema in
 * the middle of a model turn.
 */
export type LiveGenerationRuntime = {
  readBootstrap: () => GenerationProviderBootstrap;
  registry: LiveGenerationRegistry;
  /**
   * Capture one catalog/bootstrap/registry snapshot for one draft lifecycle.
   *
   * This deliberately is a factory rather than a runtime-wide cache: a later
   * planning call starts a new scope and therefore observes catalog changes.
   */
  createDraftScope: () => LiveGenerationRuntimeScope;
};

export type LiveGenerationRuntimeFactories = {
  catalogReader?: () => CatalogState;
  bootstrap?: (state: CatalogState, options: { catalogReader: () => CatalogState }) => GenerationProviderBootstrap;
  registry?: (state: CatalogState, readiness: GenerationProviderBootstrap["readinessByProvider"]) => Pick<ModuleRegistry, "resolve"> & Partial<Pick<ModuleRegistry, "snapshot">>;
};

export function createLiveGenerationRuntime(factories: LiveGenerationRuntimeFactories = {}): LiveGenerationRuntime {
  const catalogReader = factories.catalogReader ?? readCatalog;
  const bootstrap = factories.bootstrap ?? ((state, options) => createGenerationProviderBootstrap(state, options));
  const registryFactory = factories.registry ?? ((state, readiness) => createCatalogModuleRegistry(state, { readinessByProvider: readiness }));

  const readBootstrap = (): GenerationProviderBootstrap => bootstrap(catalogReader(), { catalogReader });
  const createDraftScope = (): LiveGenerationRuntimeScope => {
    const state = catalogReader();
    const capturedBootstrap = bootstrap(state, { catalogReader });
    const capturedRegistry = registryFactory(state, capturedBootstrap.readinessByProvider);
    return {
      readBootstrap: () => capturedBootstrap,
      registry: capturedRegistry,
    };
  };
  const readRegistry = () => {
    const state = catalogReader();
    const capturedBootstrap = bootstrap(state, { catalogReader });
    return registryFactory(state, capturedBootstrap.readinessByProvider);
  };

  // A planning turn resolves many shots synchronously. Keep the expensive
  // catalog-derived registry for that one turn only, then drop it at the next
  // microtask boundary. This is deliberately an ephemeral hand-off cache, not
  // a runtime-wide catalog cache: the next draft turn reads the catalog again,
  // so an on-disk/catalog update cannot stay hidden behind a stale registry.
  let turnRegistry: ReturnType<typeof readRegistry> | undefined;
  let clearTurnRegistryScheduled = false;
  const readTurnRegistry = () => {
    const existing = turnRegistry;
    if (existing) return existing;
    const created = readRegistry();
    turnRegistry = created;
    if (!clearTurnRegistryScheduled) {
      clearTurnRegistryScheduled = true;
      queueMicrotask(() => {
        turnRegistry = undefined;
        clearTurnRegistryScheduled = false;
      });
    }
    return created;
  };

  // Keep a stable object identity for the planning handler while resolving
  // against one ephemeral catalog/readiness snapshot per synchronous planning
  // turn. The caller keeps its existing registry dependency; the shared
  // runtime boundary owns the lifetime and invalidation policy.
  const registry: LiveGenerationRuntime["registry"] = {
    resolve: (request: ModuleResolveInput): ResolvedModule => readTurnRegistry().resolve(request),
    snapshot: () => readTurnRegistry().snapshot?.() ?? [],
  };
  return { readBootstrap, registry, createDraftScope };
}
