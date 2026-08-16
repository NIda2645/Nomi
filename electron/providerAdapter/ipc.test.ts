import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
  },
}));

import { registerProviderAdapterIpc } from "./ipc";

describe("registerProviderAdapterIpc", () => {
  beforeEach(() => handlers.clear());

  it("exposes register/start/get/latest/cancel/list without returning credentials", async () => {
    const run = {
      id: "run-1",
      vendorKey: "example-com",
      stage: "queued",
      connectionFingerprint: "sha256-derived-from-secret",
    };
    const publicRun = { id: "run-1", vendorKey: "example-com", stage: "queued" };
    const registration = {
      vendorKey: "example-com",
      vendorName: "Example",
      state: "configured",
      selectedModelKeys: ["paint-v2"],
      models: [{ modelKey: "paint-v2", kind: "image", state: "unverified" }],
      savedAt: "2026-08-15T00:00:00.000Z",
    };
    const service = {
      register: vi.fn(() => registration),
      start: vi.fn(() => run),
      getRun: vi.fn(() => run),
      latestRun: vi.fn(() => run),
      cancel: vi.fn(() => ({ ...run, stage: "cancelled" })),
      listRuns: vi.fn(() => [run]),
      resumeInterrupted: vi.fn(),
    };
    registerProviderAdapterIpc(service as never);

    const registered = await handlers.get("nomi:provider-adapter:register")?.({}, {
      vendorName: "Example",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-secret",
      catalogVendorKey: "renderer-cannot-choose-this",
      preserveExistingCredential: true,
      models: [{ modelKey: "paint-v2", kind: "image" }],
    });
    const started = await handlers.get("nomi:provider-adapter:start")?.({}, {
      vendorName: "Example",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-secret",
      models: [{ modelKey: "paint-v2", kind: "image" }],
    });
    const fetched = await handlers.get("nomi:provider-adapter:get")?.({}, { runId: "run-1" });
    const latest = await handlers.get("nomi:provider-adapter:latest")?.({}, { vendorKey: "example-com" });
    const cancelled = await handlers.get("nomi:provider-adapter:cancel")?.({}, { runId: "run-1" });
    const listed = await handlers.get("nomi:provider-adapter:list")?.({}, { vendorKey: "example-com", activeOnly: true, limit: 5 });

    expect(registered).toEqual({ ok: true, registration });
    expect(service.register).toHaveBeenCalledWith(expect.not.objectContaining({
      catalogVendorKey: expect.anything(),
      preserveExistingCredential: expect.anything(),
    }));
    expect(started).toEqual({ ok: true, run: publicRun });
    expect(JSON.stringify(registered)).not.toContain("sk-secret");
    expect(JSON.stringify(started)).not.toContain("sk-secret");
    expect(fetched).toEqual({ ok: true, run: publicRun });
    expect(latest).toEqual({ ok: true, run: publicRun });
    expect(cancelled).toEqual({ ok: true, run: { ...publicRun, stage: "cancelled" } });
    expect(listed).toEqual({ ok: true, runs: [publicRun] });
    expect(JSON.stringify([started, fetched, latest, cancelled, listed])).not.toContain("connectionFingerprint");
    expect(JSON.stringify([started, fetched, latest, cancelled, listed])).not.toContain("sha256-derived-from-secret");
    expect(service.listRuns).toHaveBeenCalledWith({ vendorKey: "example-com", activeOnly: true, limit: 5 });
    expect(service.resumeInterrupted).toHaveBeenCalledTimes(1);
  });
});
