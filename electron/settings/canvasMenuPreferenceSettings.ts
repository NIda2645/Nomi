import path from 'node:path'
import { readConfigFileOrDefault, writeConfigFileAtomic } from '../configFileStore'
import { getSettingsRoot } from './settingsRoot'
import { DEFAULT_CANVAS_MENU_PREFERENCE_SETTINGS, normalizeCanvasMenuPreferenceSettings, type CanvasMenuPreferenceSettings } from '../shared/contracts/canvasMenuPreference'
const FILE = 'canvas-menu-preference.json'
export function canvasMenuPreferenceSettingsPath(): string { return path.join(getSettingsRoot(), FILE) }
export function readCanvasMenuPreferenceSettings(): CanvasMenuPreferenceSettings { return normalizeCanvasMenuPreferenceSettings(readConfigFileOrDefault<unknown>(canvasMenuPreferenceSettingsPath(), () => DEFAULT_CANVAS_MENU_PREFERENCE_SETTINGS)) }
export function writeCanvasMenuPreferenceSettings(value: unknown): CanvasMenuPreferenceSettings { const next = normalizeCanvasMenuPreferenceSettings(value); writeConfigFileAtomic(canvasMenuPreferenceSettingsPath(), next); return next }
