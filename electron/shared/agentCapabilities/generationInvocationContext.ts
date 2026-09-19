/** Trusted host context captured at the lane boundary for generation calls. */
export type GenerationInvocationContext = Readonly<{
  sourceDocument?: Readonly<{
    documentId: string;
    revision: number;
    contentHash: string;
  }>;
  selectedPlan?: Readonly<{
    runId: string;
    revision: number;
  }>;
}>;
