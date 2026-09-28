import path from 'node:path'
import { readConfigFileOrDefault, writeConfigFileAtomic } from '../configFileStore'
import { getSettingsRoot } from './settingsRoot'
import { DEFAULT_MODEL_BOX_PREFERENCE_SETTINGS, normalizeModelBoxPreferenceSettings, type ModelBoxPreferenceSettings } from './modelBoxPreferenceContract'
const FILE = 'model-box-preference.json'
export function modelBoxPreferenceSettingsPath(): string { return path.join(getSettingsRoot(), FILE) }
export function readModelBoxPreferenceSettings(): ModelBoxPreferenceSettings { return normalizeModelBoxPreferenceSettings(readConfigFileOrDefault<unknown>(modelBoxPreferenceSettingsPath(), () => DEFAULT_MODEL_BOX_PREFERENCE_SETTINGS)) }
export function writeModelBoxPreferenceSettings(value: unknown): ModelBoxPreferenceSettings { const next = normalizeModelBoxPreferenceSettings(value); writeConfigFileAtomic(modelBoxPreferenceSettingsPath(), next); return next }
