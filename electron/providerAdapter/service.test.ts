import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelV1 } from "ai";
import type { Model, Vendor } from "../catalog/types";
import type { ProviderAdapterDraft } from "./types";
import { ProviderAdapterStore } from "./store";
import {
  ProviderAdapterService,
  adapterModelMetadataForPromotion,
  prioritizeCompilerCandidates,
  type ProviderAdapterCatalogPort,
  type ProviderAdapterServiceDependencies,
} from "./service";

const dirs: string[] = [];
const now = "2026-08-07T00:00:00.000Z";

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function store(): ProviderAdapterStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-adapter-service-"));
  dirs.push(dir);
  return new ProviderAdapterStore(path.join(dir, "provider-adapters.json"));
}

function draft(): ProviderAdapterDraft {
  return {
    provider: { baseUrl: "https://api.example.com/v1", authType: "bearer" },
    sources: [{ url: "https://docs.example.com/api", evidence: "API reference" }],
    models: [
      {
        modelKey: "text-v1",
        labelZh: "Text V1",
        kind: "text",
        modes: [
          {
            taskKind: "chat",
            create: { method: "POST", path: "/chat", body: { prompt: "{{request.prompt}}" }, response_mapping: { text: "text" } },
            sourceUrls: ["https://docs.example.com/api"],
          },
        ],
      },
      {
        modelKey: "paint-v2",
        labelZh: "Paint V2",
        kind: "image",
        modes: [
          {
            taskKind: "text_to_image",
            create: { method: "POST", path: "/images", body: { prompt: "{{request.prompt}}" } },
            sourceUrls: ["https://docs.example.com/api"],
          },
          {
            taskKind: "image_edit",
            create: { method: "POST", path: "/edits", body: { image: "{{request.params.referenceImages}}" } },
            referenceParam: "referenceImages",
            referenceShape: "array",
            sourceUrls: ["https://docs.example.com/api"],
          },
        ],
      },
    ],
  };
}

function fakeCatalog(): ProviderAdapterCatalogPort & {
  promoted: Array<{ verified: string[]; draft: ProviderAdapterDraft }>;
  failed: string[];
  staged: string[][];
} {
  const vendor: Vendor = {
    key: "api-example-com",
    name: "Example",
    enabled: false,
    baseUrlHint: "https://api.example.com/v1",
    authType: "bearer",
    createdAt: now,
    updatedAt: now,
  };
  const models: Model[] = [
    { vendorKey: vendor.key, modelKey: "text-v1", labelZh: "Text V1", kind: "text", enabled: false, createdAt: now, updatedAt: now },
    { vendorKey: vendor.key, modelKey: "paint-v2", labelZh: "Paint V2", kind: "image", enabled: false, createdAt: now, updatedAt: now },
  ];
  return {
    promoted: [],
    failed: [],
    staged: [],
    stage(input) {
      this.staged.push(input.models.map((model) => model.modelKey));
      return { vendor, models };
    },
    load() {
      return { vendor, models, apiKey: "sk-test" };
    },
    promote(input) {
      this.promoted.push({
        verified: input.verifiedModes.map((item) => `${item.modelKey}/${item.taskKind}`),
        draft: input.draft,
      });
    },
    fail(run) {
      this.failed.push(run.id);
    },
  };
}

function dependencies(catalog: ReturnType<typeof fakeCatalog>): ProviderAdapterServiceDependencies {
  return {
    catalog,
    schedule: () => {},
    discover: async () => ({
      sources: [{ url: "https://docs.example.com/api", text: "API reference" }],
      corpus: "API reference",
    }),
    resolveLanguageModels: () => [{} as LanguageModelV1],
    compile: async () => ({ draft: draft(), failures: [] }),
    repair: async () => draft(),
    verify: async ({ mode }) => ({ ok: true, taskKind: mode.taskKind }),
    now: () => now,
    id: () => "run-test",
  };
}

const startInput = {
  vendorName: "Example",
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  authType: "bearer" as const,
  providerKind: "openai-compatible" as const,
  headers: {},
  models: [
    { modelKey: "text-v1", labelZh: "Text V1", kind: "text" as const },
    { modelKey: "paint-v2", labelZh: "Paint V2", kind: "image" as const },
  ],
};

describe("ProviderAdapterService", () => {
  it("preserves the last-known-good model metadata when a new candidate has no verified mode", () => {
    const oldMeta = {
      parameters: [{ key: "quality", default: "stable" }],
      imageOptions: { supportsReferenceImages: true },
      adapter: { activeRevision: "revision-good" },
    };

    const next = adapterModelMetadataForPromotion({
      oldMeta,
      candidate: draft().models[1],
      modeResults: [{ taskKind: "text_to_image", state: "failed", attempts: 1, stage: "create" }],
      runId: "run-new",
      revisionId: "revision-new",
      updatedAt: now,
    });

    expect(next.parameters).toEqual(oldMeta.parameters);
    expect(next.imageOptions).toEqual(oldMeta.imageOptions);
    expect(next.adapter).toMatchObject({ state: "failed", activeRevision: "revision-good" });
  });

  it("keeps a previously verified reference-image mode when a newer partial draft omits it", () => {
    const next = adapterModelMetadataForPromotion({
      oldMeta: {
        imageOptions: { supportsReferenceImages: true },
        adapter: { activeRevision: "revision-good" },
      },
      candidate: { ...draft().models[1], modes: [draft().models[1].modes[0]] },
      modeResults: [{ taskKind: "text_to_image", state: "verified", attempts: 1 }],
      runId: "run-new",
      revisionId: "revision-new",
      updatedAt: now,
    });

    expect(next.imageOptions).toMatchObject({ supportsReferenceImages: true });
  });

  it("tries one model per configured vendor before another model from the same failing vendor", () => {
    const candidates = [
      { vendorKey: "vendor-a", id: "a-1" },
      { vendorKey: "vendor-a", id: "a-2" },
      { vendorKey: "vendor-b", id: "b-1" },
      { vendorKey: "vendor-c", id: "c-1" },
    ];

    expect(prioritizeCompilerCandidates(candidates).map((candidate) => candidate.id)).toEqual([
      "a-1",
      "b-1",
      "c-1",
      "a-2",
    ]);
  });

  it("uses independent configured AI vendors before asking the provider under test to analyze itself", () => {
    const candidates = [
      { vendorKey: "target-vendor", id: "target" },
      { vendorKey: "vendor-a", id: "a-1" },
      { vendorKey: "vendor-b", id: "b-1" },
      { vendorKey: "vendor-a", id: "a-2" },
    ];

    expect(prioritizeCompilerCandidates(candidates, "target-vendor").map((candidate) => candidate.id)).toEqual([
      "a-1",
      "b-1",
      "a-2",
      "target",
    ]);
  });

  it("stages all selected models in one batch and promotes only verified modes", async () => {
    const catalog = fakeCatalog();
    const deps = dependencies(catalog);
    deps.verify = async ({ mode }) =>
      mode.taskKind === "image_edit"
        ? { ok: false, taskKind: mode.taskKind, stage: "create", error: "HTTP 400 image field" }
        : { ok: true, taskKind: mode.taskKind };
    deps.repair = async () => draft();
    const service = new ProviderAdapterService(store(), deps);
    const started = service.start(startInput);

    await service.executeRun(started.id);

    expect(catalog.staged).toEqual([["text-v1", "paint-v2"]]);
    expect(catalog.promoted[0]?.verified).toEqual(["text-v1/chat", "paint-v2/text_to_image"]);
    expect(service.getRun(started.id)?.stage).toBe("partial");
  });

  it("retests every mode after an AI repair so a fix cannot regress a prior pass", async () => {
    const catalog = fakeCatalog();
    const deps = dependencies(catalog);
    const verify = vi
      .fn()
      .mockImplementationOnce(async ({ mode }) => ({ ok: true, taskKind: mode.taskKind }))
      .mockImplementationOnce(async ({ mode }) => ({ ok: true, taskKind: mode.taskKind }))
      .mockImplementationOnce(async ({ mode }) => ({ ok: false, taskKind: mode.taskKind, stage: "create", error: "bad image field" }))
      .mockImplementation(async ({ mode }) => ({ ok: true, taskKind: mode.taskKind }));
    deps.verify = verify;
    deps.repair = vi.fn(async () => draft());
    const service = new ProviderAdapterService(store(), deps);
    const started = service.start(startInput);

    await service.executeRun(started.id);

    expect(deps.repair).toHaveBeenCalledTimes(1);
    expect(deps.repair).toHaveBeenCalledWith(expect.objectContaining({
      failure: expect.objectContaining({ modelKey: "paint-v2", taskKind: "image_edit" }),
    }));
    expect(verify).toHaveBeenCalledTimes(6);
    expect(catalog.promoted[0]?.verified).toEqual([
      "text-v1/chat",
      "paint-v2/text_to_image",
      "paint-v2/image_edit",
    ]);
    expect(service.getRun(started.id)?.stage).toBe("completed");
  });

  // 回归钉子（2026-08-11 用户接 DeepSeek 踩到「自动修复一直失败」）：文本模型验证走
  // streamTextTask（生产同一条路）、根本不读编译出来的 HTTP 草稿，所以重修草稿对文本失败
  // 是个空操作——旧代码照样空转 2 轮、界面还写着「正在根据真实错误自动修复…」，用户白等。
  it("does not burn repair rounds on a text failure that repairing the HTTP draft cannot change", async () => {
    const catalog = fakeCatalog();
    const deps = dependencies(catalog);
    deps.verify = async ({ mode }) =>
      mode.taskKind === "chat"
        ? { ok: false, taskKind: mode.taskKind, stage: "create", error: "empty reply" }
        : { ok: true, taskKind: mode.taskKind };
    deps.repair = vi.fn(async () => draft());
    const service = new ProviderAdapterService(store(), deps);
    const started = service.start(startInput);

    await service.executeRun(started.id);

    expect(deps.repair).not.toHaveBeenCalled();
    expect(service.getRun(started.id)?.repairAttempt).toBe(0);
  });

  it("does not publish a failed candidate when no mode passed", async () => {
    const catalog = fakeCatalog();
    const deps = dependencies(catalog);
    deps.compile = async () => ({ draft: { ...draft(), models: [draft().models[1]] }, failures: [] });
    deps.verify = async ({ mode }) => ({ ok: false, taskKind: mode.taskKind, stage: "create", error: "HTTP 500" });
    deps.repair = async () => ({ ...draft(), models: [draft().models[1]] });
    const service = new ProviderAdapterService(store(), deps);
    const started = service.start({ ...startInput, models: [startInput.models[1]] });

    await service.executeRun(started.id);

    expect(catalog.promoted[0]?.verified).toEqual([]);
    expect(service.getRun(started.id)?.stage).toBe("failed");
  });

  it("finalizes the provider card as failed when discovery or compilation aborts before a draft exists", async () => {
    const catalog = fakeCatalog();
    const deps = dependencies(catalog);
    deps.discover = async () => {
      throw new Error("No official API documentation could be discovered");
    };
    const service = new ProviderAdapterService(store(), deps);
    const started = service.start(startInput);

    await service.executeRun(started.id);

    expect(service.getRun(started.id)).toMatchObject({ stage: "failed" });
    expect(catalog.failed).toEqual([started.id]);
  });

  it("keeps verified modes publishable when repairing a different failed model returns malformed output", async () => {
    const catalog = fakeCatalog();
    const deps = dependencies(catalog);
    deps.verify = async ({ mode }) =>
      mode.taskKind === "chat"
        ? { ok: true, taskKind: mode.taskKind }
        : { ok: false, taskKind: mode.taskKind, stage: "create", error: "HTTP 404 wrong endpoint" };
    deps.repair = async () => {
      throw new Error("No object generated: could not parse the response");
    };
    const service = new ProviderAdapterService(store(), deps);
    const started = service.start(startInput);

    await service.executeRun(started.id);

    expect(catalog.promoted[0]?.verified).toEqual(["text-v1/chat"]);
    expect(service.getRun(started.id)).toMatchObject({
      stage: "partial",
      error: expect.stringContaining("could not parse"),
    });
  });

  it("continues verification and partial publication when one selected model cannot be compiled", async () => {
    const catalog = fakeCatalog();
    const deps = dependencies(catalog);
    deps.compile = async () => ({
      draft: { ...draft(), models: [draft().models[1]] },
      failures: [{ modelKey: "text-v1", error: "No documented chat mode" }],
    });
    const service = new ProviderAdapterService(store(), deps);
    const started = service.start(startInput);

    await service.executeRun(started.id);

    expect(catalog.promoted[0]?.verified).toEqual(["paint-v2/text_to_image", "paint-v2/image_edit"]);
    expect(service.getRun(started.id)).toMatchObject({
      stage: "partial",
      models: expect.arrayContaining([
        expect.objectContaining({
          modelKey: "text-v1",
          modes: [expect.objectContaining({ state: "failed", stage: "compile" })],
        }),
      ]),
    });
  });

  it("schedules interrupted non-terminal runs for resume", () => {
    const catalog = fakeCatalog();
    const deps = dependencies(catalog);
    const schedule = vi.fn();
    deps.schedule = schedule;
    const adapterStore = store();
    const first = new ProviderAdapterService(adapterStore, { ...deps, schedule: () => {} });
    const started = first.start(startInput);

    const restarted = new ProviderAdapterService(adapterStore, deps);
    restarted.resumeInterrupted();

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0]?.[0]).toBe(started.id);
  });

  it("marks an older run stale and never lets it overwrite a newer run for the same provider", async () => {
    const catalog = fakeCatalog();
    const deps = dependencies(catalog);
    let sequence = 0;
    deps.id = () => `run-${++sequence}`;
    const service = new ProviderAdapterService(store(), deps);
    const older = service.start(startInput);
    const newer = service.start(startInput);

    await service.executeRun(older.id);
    await service.executeRun(newer.id);

    expect(service.getRun(older.id)).toMatchObject({ stage: "stale" });
    expect(service.getRun(newer.id)).toMatchObject({ stage: "completed" });
    expect(catalog.promoted).toHaveLength(1);
  });
});
