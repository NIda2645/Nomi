type HealthProbeModel = {
  adapterState?: string
}

/**
 * A save-first registration returns to the model home with every new model in
 * `unverified`. Mounting that card must not silently repeat GET /models after
 * the user already chose Save. Existing connections retain their health
 * behavior once any model has moved beyond that fresh local-only state.
 */
export function shouldSkipImplicitVendorHealth({
  models,
}: {
  models: readonly HealthProbeModel[]
}): boolean {
  return models.length > 0 && models.every((model) => model.adapterState === 'unverified')
}

export function shouldRunVendorHealthProbe({
  hasApiKey,
  disabled,
  skipImplicit,
  explicit,
}: {
  hasApiKey: boolean
  disabled: boolean
  skipImplicit: boolean
  explicit: boolean
}): boolean {
  return hasApiKey && !disabled && (explicit || !skipImplicit)
}
