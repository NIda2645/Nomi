// 任务的项目身份在提交那一刻固定（cached.projectId），轮询只能复述它：
// 带来另一个项目 = 调用方拿错了身份 → 拒绝，且不打供应商、不把结果本地化进别的项目。
// 主进程不再记「当前活动项目」替任务补身份（旧 activeTaskProjectFallback 已删除）。
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeProfileOperation = vi.fn();

vi.mock("../runtime", async () => {
  const actual = await vi.importActual<typeof import("../runtime")>("../runtime");
  return {
    ...actual,
    executeProfileOperation: (...args: unknown[]) => executeProfileOperation(...args),
    findExecutableModel: () => ({
      vendor: { key: "acme", baseUrlHint: "https://acme.test" },
      model: { modelKey: "acme-video", kind: "video" },
      apiKey: "k",
    }),
  };
});

const QUERY_ONLY_MAPPING = {
  name: "acme video",
  enabled: true,
  create: { method: "POST", path: "/v1/video" },
  query: { method: "GET", path: "/v1/video/{{query_id}}", response_mapping: { status: "status" } },
};

async function seedPendingTask(taskId: string, projectId?: string) {
  const { admitTask, taskCache } = await import("../runtime");
  taskCache.delete(taskId);
  admitTask(taskId, {
    vendor: "acme",
    request: { kind: "text_to_video", prompt: "a cat", extras: { modelKey: "acme-video" } },
    raw: {},
    mapping: QUERY_ONLY_MAPPING as never,
    model: { modelKey: "acme-video", kind: "video" } as never,
    providerMeta: { task_id: taskId, query_id: taskId },
    wantedKind: "video",
    ...(projectId ? { projectId } : {}),
  });
}

describe("task polling repeats the submission project identity", () => {
  beforeEach(() => executeProfileOperation.mockReset());

  it("refuses a poll that names another project before touching the provider", async () => {
    const { fetchTaskResult } = await import("./taskResultQuery");
    await seedPendingTask("task-owned-by-a", "project-a");
    await expect(fetchTaskResult({ taskId: "task-owned-by-a", projectId: "project-b" })).rejects.toThrow("TASK_PROJECT_MISMATCH");
    expect(executeProfileOperation).not.toHaveBeenCalled();
  });

  it("a task submitted without a project cannot be adopted by a later poll", async () => {
    const { fetchTaskResult } = await import("./taskResultQuery");
    await seedPendingTask("task-without-project");
    await expect(fetchTaskResult({ taskId: "task-without-project", projectId: "project-b" })).rejects.toThrow("TASK_PROJECT_MISMATCH");
    expect(executeProfileOperation).not.toHaveBeenCalled();
  });

  it("the matching identity (or an internal poll that names none) queries normally", async () => {
    const { fetchTaskResult } = await import("./taskResultQuery");
    executeProfileOperation.mockResolvedValue({ response: { status: "processing" }, request: {} });
    await seedPendingTask("task-a-match", "project-a");
    await expect(fetchTaskResult({ taskId: "task-a-match", projectId: "project-a" })).resolves.toMatchObject({ vendor: "acme" });
    await expect(fetchTaskResult({ taskId: "task-a-match" })).resolves.toMatchObject({ vendor: "acme" });
    expect(executeProfileOperation).toHaveBeenCalledTimes(2);
  });
});
