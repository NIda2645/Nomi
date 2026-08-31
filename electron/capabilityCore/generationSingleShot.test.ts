import { describe, expect, it, vi } from "vitest";

import {
  SubmissionReceiptUnknownError,
  createGenerationSingleShot,
} from "./generationSingleShot";

describe("generation.single-shot orchestration", () => {
  it("seals before dispatch and persists provider acceptance before polling", async () => {
    const order: string[] = [];
    const submit = vi.fn(async () => { order.push("dispatch"); return { providerTaskId: "provider-task-1", run: { runId: "run-1" } }; });
    const runner = createGenerationSingleShot({
      seal: vi.fn(async () => { order.push("seal"); return { state: "sealed" }; }),
      submit: submit as never,
      persistProviderAccepted: vi.fn(async () => { order.push("provider_accepted"); }),
      startPolling: vi.fn(async () => { order.push("poll"); }),
    });
    await expect(runner.start({ runId: "run-1", jobId: "job-1" } as never)).resolves.toMatchObject({ providerTaskId: "provider-task-1" });
    expect(order).toEqual(["seal", "dispatch", "provider_accepted", "poll"]);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("marks unknown and returns reconcile-only when dispatch may have been accepted", async () => {
    const markUnknown = vi.fn(async () => undefined);
    const runner = createGenerationSingleShot({
      seal: vi.fn(async () => ({ state: "sealed" })),
      submit: vi.fn(async () => { throw new SubmissionReceiptUnknownError(); }) as never,
      persistProviderAccepted: vi.fn(async () => undefined),
      startPolling: vi.fn(async () => undefined),
      markUnknown,
    });
    await expect(runner.start({ runId: "run-1", jobId: "job-1" } as never)).rejects.toThrow(SubmissionReceiptUnknownError);
    expect(markUnknown).toHaveBeenCalledTimes(1);
  });

  it("marks unknown when the provider returned but the acceptance receipt could not be persisted", async () => {
    const markUnknown = vi.fn(async () => undefined);
    const runner = createGenerationSingleShot({
      seal: vi.fn(async () => ({ state: "sealed" })),
      submit: vi.fn(async () => ({ providerTaskId: "provider-task-1", run: { runId: "run-1" } })),
      persistProviderAccepted: vi.fn(async () => { throw new Error("crash while persisting receipt"); }),
      startPolling: vi.fn(async () => undefined),
      markUnknown,
    });
    await expect(runner.start({ runId: "run-1", jobId: "job-1" } as never)).rejects.toThrow("crash while persisting receipt");
    expect(markUnknown).toHaveBeenCalledTimes(1);
  });
});
