/** Only domain owners mint absence after project and storage validation. */
export class ProductionRunNotFoundError extends Error {
  readonly code = 'production_run_not_found';
  constructor() { super('Production run not found'); }
}

export class GenerationOperationNotFoundError extends Error {
  readonly code = 'generation_operation_not_found';
  constructor() { super('Generation operation not found'); }
}

export function productionTaskAbsenceCode(error: unknown): string | undefined {
  return error instanceof ProductionRunNotFoundError || error instanceof GenerationOperationNotFoundError ? error.code : undefined;
}
