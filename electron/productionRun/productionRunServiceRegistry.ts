import type { ProductionRunService } from './productionRunService'

let registered: ProductionRunService | null = null

export function registerProductionRunService(service: ProductionRunService): void {
  registered = service
}

export function getRegisteredProductionRunService(): ProductionRunService {
  if (!registered) throw new Error('Production Run service is not registered')
  return registered
}

export function resetRegisteredProductionRunService(): void {
  registered = null
}
