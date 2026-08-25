import path from "node:path";

import { readJsonFile, writeJsonFileAtomic } from "../jsonFile";
import {
  DEFAULT_GENERATION_MODEL_DEFAULTS,
  normalizeGenerationModelDefaults,
  type GenerationModelDefaults,
} from "./generationModelDefaultsContract";
import { getSettingsRoot } from "./settingsRoot";

const GENERATION_MODEL_DEFAULTS_FILE = "generation-model-defaults.json";

export {
  DEFAULT_GENERATION_MODEL_DEFAULTS,
  GENERATION_DEFAULT_TASK_KINDS,
  normalizeGenerationModelDefaults,
  type GenerationDefaultTaskKind,
  type GenerationModelDefault,
  type GenerationModelDefaults,
} from "./generationModelDefaultsContract";

export function generationModelDefaultsSettingsPath(): string {
  return path.join(getSettingsRoot(), GENERATION_MODEL_DEFAULTS_FILE);
}

export function readGenerationModelDefaults(): GenerationModelDefaults {
  try {
    return normalizeGenerationModelDefaults(readJsonFile(generationModelDefaultsSettingsPath()));
  } catch {
    return normalizeGenerationModelDefaults(DEFAULT_GENERATION_MODEL_DEFAULTS);
  }
}

export function writeGenerationModelDefaults(value: unknown): GenerationModelDefaults {
  const next = normalizeGenerationModelDefaults(value);
  writeJsonFileAtomic(generationModelDefaultsSettingsPath(), next);
  return next;
}
