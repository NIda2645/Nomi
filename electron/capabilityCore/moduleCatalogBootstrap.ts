import { createModuleRegistry } from "./moduleRegistry";
import type { ModuleManifest } from "./moduleManifest";

/**
 * Built-ins are passed in by the application bootstrap. This keeps provider/model
 * discovery explicit and testable; this function never fetches or installs code.
 */
export function createBuiltinModuleRegistry(manifests: readonly ModuleManifest[] = []) {
  return createModuleRegistry(manifests);
}

