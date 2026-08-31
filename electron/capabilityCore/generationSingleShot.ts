import { SubmissionReceiptUnknownError } from "../productionRun/submissionOutbox";

export { SubmissionReceiptUnknownError } from "../productionRun/submissionOutbox";

export type GenerationSingleShotDependencies = {
  seal: (input: unknown) => Promise<unknown> | unknown;
  submit: (input: unknown) => Promise<{ providerTaskId: string; run: unknown }>;
  persistProviderAccepted: (input: { providerTaskId: string; run: unknown }) => Promise<void> | void;
  startPolling: (input: { providerTaskId: string; run: unknown }) => Promise<void> | void;
  markUnknown?: () => Promise<void> | void;
};

export function createGenerationSingleShot(deps: GenerationSingleShotDependencies) {
  async function start(input: unknown): Promise<{ providerTaskId: string; run: unknown }> {
    await deps.seal(input);
    let result: { providerTaskId: string; run: unknown };
    try {
      result = await deps.submit(input);
    } catch (error) {
      if (error instanceof SubmissionReceiptUnknownError) await deps.markUnknown?.();
      throw error;
    }
    try {
      await deps.persistProviderAccepted(result);
    } catch (error) {
      await deps.markUnknown?.();
      throw error;
    }
    await deps.startPolling(result);
    return result;
  }

  return { start };
}
