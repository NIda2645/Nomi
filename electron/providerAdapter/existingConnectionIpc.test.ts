import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
  },
}));

import { registerExistingConnectionIpc } from "./existingConnectionIpc";

describe("registerExistingConnectionIpc", () => {
  beforeEach(() => handlers.clear());

  it("accepts only a saved vendor id when listing models", async () => {
    const actions = {
      listModels: vi.fn(async () => ({ ok: true, models: ["a"], connection: { vendorKey: "saved" } })),
      register: vi.fn(),
      start: vi.fn(),
      adapt: vi.fn(),
      retry: vi.fn(),
    };
    registerExistingConnectionIpc(actions as never);

    await handlers.get("nomi:provider-adapter:existing:list-models")?.({}, {
      vendorKey: " saved ",
      apiKey: "renderer-must-not-override-this",
      baseUrl: "https://attacker.invalid",
    });

    expect(actions.listModels).toHaveBeenCalledWith({ vendorKey: "saved" });
  });

  it("sanitizes model selections and ignores renderer connection credentials", async () => {
    const actions = {
      listModels: vi.fn(),
      register: vi.fn(),
      start: vi.fn(async () => ({ ok: true, run: { id: "run-1" } })),
      adapt: vi.fn(),
      retry: vi.fn(),
    };
    registerExistingConnectionIpc(actions as never);

    const result = await handlers.get("nomi:provider-adapter:existing:start")?.({}, {
      vendorKey: "saved",
      apiKey: "renderer-must-not-override-this",
      models: [
        { id: " image-a ", displayName: " Image A ", kind: "image" },
        { modelKey: "future-kind", kind: "not-a-kind" },
      ],
    });

    expect(actions.start).toHaveBeenCalledWith({
      vendorKey: "saved",
      models: [
        { modelKey: "image-a", labelZh: "Image A", kind: "image" },
        { modelKey: "future-kind", kind: "text" },
      ],
    });
    expect(result).toEqual({ ok: true, run: { id: "run-1" } });
  });

  it("keeps save and explicit adaptation as separate existing-connection actions", async () => {
    const actions = {
      listModels: vi.fn(),
      register: vi.fn(async () => ({ ok: true, registration: { vendorKey: "saved" } })),
      start: vi.fn(),
      adapt: vi.fn(async () => ({ ok: true, run: { id: "run-adapt" } })),
      retry: vi.fn(),
    };
    registerExistingConnectionIpc(actions as never);
    const payload = {
      vendorKey: " saved ",
      apiKey: "renderer-must-not-override-this",
      models: [{ id: " image-a ", displayName: " Image A ", kind: "image" }],
    };

    const registered = await handlers.get("nomi:provider-adapter:existing:register")?.({}, payload);
    const adapted = await handlers.get("nomi:provider-adapter:existing:adapt")?.({}, payload);

    const expected = {
      vendorKey: "saved",
      models: [{ modelKey: "image-a", labelZh: "Image A", kind: "image" }],
    };
    expect(actions.register).toHaveBeenCalledWith(expected);
    expect(actions.adapt).toHaveBeenCalledWith(expected);
    expect(registered).toEqual({ ok: true, registration: { vendorKey: "saved" } });
    expect(adapted).toEqual({ ok: true, run: { id: "run-adapt" } });
  });

  it("accepts only the persisted run id and optional model key when retrying", async () => {
    const actions = {
      listModels: vi.fn(),
      register: vi.fn(),
      start: vi.fn(),
      adapt: vi.fn(),
      retry: vi.fn(async () => ({ ok: true, run: { id: "run-new" } })),
    };
    registerExistingConnectionIpc(actions as never);

    const result = await handlers.get("nomi:provider-adapter:retry")?.({}, {
      runId: " run-old ",
      modelKey: " failed-video ",
      vendorKey: "attacker-vendor",
      apiKey: "renderer-must-not-override-this",
      baseUrl: "https://attacker.invalid",
      models: [{ modelKey: "attacker-model", kind: "text" }],
    });

    expect(actions.retry).toHaveBeenCalledWith({ runId: "run-old", modelKey: "failed-video" });
    expect(result).toEqual({ ok: true, run: { id: "run-new" } });
  });
});
