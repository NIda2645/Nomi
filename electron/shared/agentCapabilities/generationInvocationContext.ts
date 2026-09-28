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

/**
 * **渲染层声称的意图**，在 lane 边界上取一次快照。**不是**已验证的宿主事实。
 *
 * 这里原本写着 "Trusted host context"，而这两个字段整份来自渲染层提交的那个信封——同一份契约里
 * 它自己把 `target` / `preconditions` 标成 "untrusted selectors"。唯一那道检查是拿一个未验证字段
 * 去核另一个未验证字段（自证）。今天下游只是**记录**它（`run.origin.sourceDocument`）和**比对**它
 * （`assertTarget` → `storyboard_target_stale`），没有人拿它当凭据，所以这不是一个正在冒烟的洞；
 * 但那句注释会让下一个人按「已验证」用它，而方向写反的身份检查看起来和真检查一模一样。
 *
 * 主进程今天**证不了**这两个值：文稿 `revision` 是 store 里的 `updatedAt`、`contentHash` 由渲染层
 * 用编辑器那套 schema 算（`src/workbench/project/documentSessionPort.ts`），主进程手里没有这份状态。
 * 所以规矩写在这里：**领域 owner 在据此动作之前必须自己验一次**；只当标签用（记录、比对、拒绝陈旧）
 * 时可以直接用。
 */
export type GenerationInvocationContext = Readonly<{
  storyboardTarget?: StoryboardRequestTarget;
  sourceDocument?: Readonly<{
    documentId: string;
    revision: number;
    contentHash: string;
  }>;
}>;
