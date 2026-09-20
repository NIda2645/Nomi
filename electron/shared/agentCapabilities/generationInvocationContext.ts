/** Immutable creation intent, captured before any asynchronous admission work. */
export type StoryboardRequestTarget = Readonly<{
  projectId: string;
  sourceDocumentId: string;
  sourceDocumentRevision: number;
  sourceDocumentContentHash: string;
  targetRunId: string;
  targetKind: 'storyboard';
  requestId: string;
  expectedRevision?: number;
  shotIds?: readonly string[];
}>;

/** Model guidance describes the same immutable target enforced by the host. */
export function formatStoryboardRequestTarget(target: StoryboardRequestTarget | undefined): string {
  if (!target) return '';
  return [
    '[Storyboard request target]',
    ...(target.shotIds ? [`Selected stable shot IDs: ${JSON.stringify(target.shotIds)}. Only these shots may be edited or generated; do not infer identity from display row numbers.`] : []),
    `Source document: ${target.sourceDocumentId}; source revision: ${target.sourceDocumentRevision}.`,
    `Target Run: ${target.targetRunId}. Keep all storyboard results on this Run; never select another document or Run.`,
    target.expectedRevision === undefined
      ? 'This is a new plan. Use draft_shots without operationId to create it; the host assigns the target Run. Save the plan without placing it on the canvas.'
      : `This edits the selected plan at Run revision ${target.expectedRevision}. Read it with check_job using domain="generation" and jobId="${target.targetRunId}", then use draft_shots with operationId="${target.targetRunId}" to edit its shots. Do not create another plan.`,
  ].join('\n');
}

/** Trusted host context captured at the lane boundary for generation calls. */
export type GenerationInvocationContext = Readonly<{
  storyboardTarget?: StoryboardRequestTarget;
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
