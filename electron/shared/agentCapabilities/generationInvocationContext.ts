/** Immutable creation intent, captured before any asynchronous admission work. */
export type StoryboardRequestTarget = Readonly<{
  projectId: string;
  sourceDocumentId: string;
  sourceDocumentRevision: number;
  sourceDocumentContentHash: string;
  targetKind: 'storyboard';
  requestId: string;
  /**
   * Every plan already saved on this document (id + title), captured in the same synchronous
   * input turn as the rest of this target. It exists so the model **names** the plan it is
   * editing instead of the host inferring one from "whichever plan is open right now":
   * a storyboard plan is the user's document, and guessing which one to overwrite is the
   * kind of silent write that has no undo affordance in the sidebar.
   */
  plans: readonly Readonly<{ id: string; title: string }>[];
  /** The plan the attached shot references belong to. Present only together with `shotIds`. */
  designId?: string;
  shotIds?: readonly string[];
}>;

/** Model guidance describes the same immutable target enforced by the host. */
export function formatStoryboardRequestTarget(target: StoryboardRequestTarget | undefined): string {
  if (!target) return '';
  const plans = target.plans.map((plan) => `"${plan.title}" (id: ${plan.id})`).join(', ');
  return [
    '[Storyboard request target]',
    `Source document: ${target.sourceDocumentId}; source revision: ${target.sourceDocumentRevision}.`,
    plans
      ? `Plans already saved on this document: ${plans}.`
      : 'This document has no saved plan yet.',
    ...(target.shotIds
      ? [`The user selected these stable shot IDs on plan ${target.designId}: ${JSON.stringify(target.shotIds)}. `
        + 'Only these shots may be edited or generated; do not infer identity from display row numbers.']
      : []),
    'To change a plan that already exists, pass its id as draft_shots operationId together with the shotId you are changing. '
      + 'To start a new plan, call draft_shots without operationId. Never rewrite a plan the user did not name: '
      + 'if it is not clear which plan they mean, ask them first.',
    'A saved plan is never placed on the canvas by you — the user does that from the plan itself.',
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
