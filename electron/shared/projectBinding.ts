export type ProjectBinding = Readonly<{
  projectId: string;
  immutableProjectUuid: string;
  projectGeneration: number;
}>;

const IMMUTABLE_PROJECT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROJECT_BINDING_KEYS = new Set(["projectId", "immutableProjectUuid", "projectGeneration"]);

export class ProjectBindingValidationError extends Error {
  constructor() {
    super("invalid_project_binding");
    this.name = "ProjectBindingValidationError";
  }
}

export function assertProjectAgentBinding(binding: ProjectBinding): void {
  if (
    !binding ||
    typeof binding !== "object" ||
    Array.isArray(binding) ||
    Object.keys(binding).some((key) => !PROJECT_BINDING_KEYS.has(key)) ||
    Object.keys(binding).length !== PROJECT_BINDING_KEYS.size ||
    typeof binding.projectId !== "string" ||
    !binding.projectId.trim() ||
    binding.projectId !== binding.projectId.trim() ||
    typeof binding.immutableProjectUuid !== "string" ||
    !IMMUTABLE_PROJECT_UUID.test(binding.immutableProjectUuid) ||
    !Number.isSafeInteger(binding.projectGeneration) ||
    binding.projectGeneration < 1
  ) {
    throw new ProjectBindingValidationError();
  }
}

export function sameProjectAgentBinding(left: ProjectBinding, right: ProjectBinding): boolean {
  return (
    left.projectId === right.projectId &&
    left.immutableProjectUuid === right.immutableProjectUuid &&
    left.projectGeneration === right.projectGeneration
  );
}

export function projectAgentPartitionKey(binding: ProjectBinding): string {
  assertProjectAgentBinding(binding);
  return `project-agent.${encodeURIComponent(binding.immutableProjectUuid)}.g${binding.projectGeneration}`;
}

/**
 * 「已提交的项目选择」身份——`ProjectBinding` 三维 + `canonicalRootDigest`（C2，2026-09-18）。
 *
 * 为什么另起一个而不是扩 `ProjectBinding`：`canonicalRootDigest` 是「这个项目现在落在盘上
 * 哪个规范化根目录」，它属于**一次选择**，不属于项目身份本身（同一个项目换个目录挪一下，
 * 身份不变、选择要重做）。两个概念混成一个类型，导出与撤销就会开始互相误判。
 *
 * 在这之前这四维的比对在四处各写了一遍，逐字相同：
 * `exportJobIpc.sameSelection` / `exportJobManager.sameProjectIdentity` /
 * `exportJobs.sameExportProjectIdentity` / `canvasReadPortResolver.sameIdentity` /
 * `currentProjectResolver.matchesCommittedSelection`。抄得再准也只是「今天还一致」——
 * 加第五维时，跟上的那几处和没跟上的那处就开始给出不同答案，而这几处管的是
 * 「这次导出属不属于当前项目」。
 */
export type CommittedProjectSelection = ProjectBinding & Readonly<{ canonicalRootDigest: string }>;

export function sameCommittedProjectSelection(
  left: CommittedProjectSelection | null | undefined,
  right: CommittedProjectSelection | null | undefined,
): boolean {
  return Boolean(left && right)
    && sameProjectAgentBinding(left as CommittedProjectSelection, right as CommittedProjectSelection)
    && (left as CommittedProjectSelection).canonicalRootDigest === (right as CommittedProjectSelection).canonicalRootDigest;
}
