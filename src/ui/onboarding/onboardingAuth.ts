import type { ProviderKind } from '../../desktop/providerKind'

export type OnboardingAuth = {
  apiKey: string
  authType: 'none' | 'bearer' | 'x-api-key'
}

export function resolveOnboardingAuth(
  providerKind: ProviderKind,
  userApiKey: string,
  noApiKey: boolean,
): OnboardingAuth {
  if (noApiKey) return { apiKey: '', authType: 'none' }
  return {
    apiKey: userApiKey.trim(),
    authType: providerKind === 'anthropic' ? 'x-api-key' : 'bearer',
  }
}

export function isOnboardingApiKeyReady(userApiKey: string, noApiKey: boolean): boolean {
  return noApiKey || userApiKey.trim().length > 0
}
