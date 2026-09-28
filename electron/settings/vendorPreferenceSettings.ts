import path from 'node:path'
import { readConfigFileOrDefault, writeConfigFileAtomic } from '../configFileStore'
import { getSettingsRoot } from './settingsRoot'
import { DEFAULT_VENDOR_PREFERENCE_SETTINGS, normalizeVendorPreferenceSettings, type VendorPreferenceSettings } from './vendorPreferenceContract'
const FILE = 'vendor-preference.json'
export function vendorPreferenceSettingsPath(): string { return path.join(getSettingsRoot(), FILE) }
export function readVendorPreferenceSettings(): VendorPreferenceSettings { return normalizeVendorPreferenceSettings(readConfigFileOrDefault<unknown>(vendorPreferenceSettingsPath(), () => DEFAULT_VENDOR_PREFERENCE_SETTINGS)) }
export function writeVendorPreferenceSettings(value: unknown): VendorPreferenceSettings { const next = normalizeVendorPreferenceSettings(value); writeConfigFileAtomic(vendorPreferenceSettingsPath(), next); return next }
