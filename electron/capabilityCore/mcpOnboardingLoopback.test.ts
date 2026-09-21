import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { dispatch } from "./dispatcher";
import { validateToolArguments } from "./mcpArgValidation";
import { MCP_TOOL_RESOLVER } from "./mcpToolCatalog";
import { IntegrationSessionService } from "../integrationCertification/integrationSession";

/**
 * R13 · 零额度 loopback 夹具：按一次真实接入的顺序把**对外那一面**从头走一遍。
 *
 * 为什么要它：2026-09-10 那次真实实验的两个数字是「入参一次写对 36/58 = 62%」「9 个回合只有
 * 1 个完全成功」，而其余 e2e 全都用 JS 变量直传句柄和入参（完美复制、永远不会写错），把这一族
 * 问题整个测没了。这里换一种口径：**每一步的入参都先按对外广播的 JSON Schema 校验一次**，
 * 校验通过才允许派发。一次写对率 = 首次校验通过的步数 / 总步数。它测的不是模型聪不聪明，
 * 而是「照着我们广告的契约一步步走，能不能走通」。
 *
 * 2026-09-18（#754）：被驱动的那一面换成 `nomi_model_setup` / `nomi_remove_provider`
 * （手写的 `nomi_integration` / `nomi_integration_manage` 同 commit 删除）。这一面比旧面少两样
 * 东西，而它们正是旧实验里烧掉回合最多的两样：
 *   · `expectedRevision` 不再是模型入参（它是会话指纹，由执行层现读现填）；
 *   · 「提案 → 确认 → 跑自检」三跳合成一跳 `submit_declaration`（自检是收卡的一部分）。
 */

const HOST = "codex" as const;

type Step = { name: string; args: Record<string, unknown> };

function makeService(dir: string) {
  const certification = {
    startHttp: vi.fn(async () => ({
      id: "run-loopback",
      stage: "completed",
      childRunRef: { runId: "run-loopback", revisionDigest: "f".repeat(64) },
    })),
    get: vi.fn(() => ({
      id: "run-loopback",
      stage: "completed",
      childRunRef: { runId: "run-loopback", revisionDigest: "f".repeat(64) },
    })),
  };
  const sessions = new IntegrationSessionService({
    dir,
    // 会话文件必须落在这个临时目录里：不传 filePath 时服务写的是真实的 ~/.nomi/capability-core，
    // 测试会污染用户资料，而且那份文件一过 100 条会话上限，这条测试就在那台机器上永远红。
    filePath: path.join(dir, "integration-sessions.json"),
    certification: certification as never,
    credentialResolver: () => ({ apiKey: "sk-loopback", vendorKey: "deepseek" }),
    compilerAvailable: () => true,
  } as never);
  return { sessions, certification };
}

describe("接模型对外面 · 零额度 loopback", () => {
  it("照着广播的契约一步步走，全程零 schema 打回", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-onboarding-loopback-"));
    const { sessions, certification } = makeService(dir);
    const ctx = { integrationSessions: sessions, origin: { host: HOST } } as never;

    const setupTool = MCP_TOOL_RESOLVER.resolve("nomi_model_setup");
    const readTool = MCP_TOOL_RESOLVER.resolve("nomi_read");
    const removeTool = MCP_TOOL_RESOLVER.resolve("nomi_remove_provider");
    expect(setupTool).toBeDefined();
    expect(readTool).toBeDefined();
    expect(removeTool).toBeDefined();

    const attempted: Step[] = [];
    const rejectedBySchema: string[] = [];

    /** 宿主的一跳：先按对外 schema 校验入参，再按 build/resolveMethod 派发。 */
    async function call(tool: NonNullable<typeof readTool>, args: Record<string, unknown>) {
      attempted.push({ name: tool.name, args });
      const invalid = validateToolArguments(tool.name, tool.inputSchema, args);
      if (invalid) {
        rejectedBySchema.push(`${tool.name}: ${invalid.message}`);
        throw invalid;
      }
      const method = typeof (tool as { resolveMethod?: unknown }).resolveMethod === "function"
        ? (tool as { resolveMethod: (a: Record<string, unknown>) => string }).resolveMethod(args)
        : tool.method;
      return dispatch(method, tool.build(args) as Record<string, unknown>, ctx) as Promise<Record<string, unknown>>;
    }

    const setup = setupTool!;
    const read = readTool!;

    // ① 连上一家：**没有** baseUrl / authType / authHeader 这些入参，只有一条「建议」。
    const connected = await call(setup, {
      action: "connect_provider",
      name: "DeepSeek",
      docs: "https://api-docs.deepseek.com",
      suggestedBaseUrl: "https://api.deepseek.com",
    }) as { ok: boolean; setupId: string; unverified: Array<{ claim: string }>; nextAction: { kind: string } };
    expect(connected.ok).toBe(true);
    expect(connected.nextAction.kind).toBe("user_sees_key_page");
    // 这一跳之后模型手里**没有**任何可以说成「接好了」的证据。
    expect(connected.unverified.map((entry) => entry.claim)).toContain("model_produces_output");

    // ②' 用户在 Nomi 的贴 key 页粘了密钥并保存——**这一步模型做不到，也不该做得到**。
    //    夹具走与那一页同一条可信写入路（markCredentialReady），不伪造一个「模型自己存了 key」的世界。
    sessions.markCredentialReady(connected.setupId, "catalog-deepseek", HOST);

    // ② 上下文丢了也能找回来：不带 setupId 列出接入会话（与旧面同一条找回路）。
    const listed = await call(read, { target: "setup" }) as { sessions: Array<{ id: string }> };
    expect(listed.sessions.map((entry) => entry.id)).toContain(connected.setupId);

    // ③ 交卡：一跳做完「形状校验 + 同源 + 免费自检 + 登记」。**没有 expectedRevision**。
    const submitted = await call(setup, {
      action: "submit_declaration",
      setupId: connected.setupId,
      declaration: JSON.stringify({
        sources: [{ url: "https://api-docs.deepseek.com/images", evidence: "POST /images returns data[0].url" }],
        assetIngestion: { strategy: "none", sourceUrl: "https://api-docs.deepseek.com/images" },
        models: [{
          modelKey: "deepseek-paint",
          labelZh: "DeepSeek Paint",
          kind: "image",
          modes: [{
            taskKind: "text_to_image",
            create: {
              method: "POST",
              path: "/images",
              body: { prompt: "{{request.prompt}}" },
              response_mapping: { image_url: "data.0.url" },
            },
            sourceUrls: ["https://api-docs.deepseek.com/images"],
          }],
        }],
      }),
    }) as { ok: boolean; unverified: Array<{ claim: string }>; blastRadius: { modelsAppearing: number; outboundRequests: Array<{ billable: boolean }> } };
    expect(submitted.ok).toBe(true);
    expect(submitted.blastRadius.modelsAppearing).toBe(1);
    // 自检发的请求**恒不计费**——这条路上一个花钱的动作都没有。
    expect(submitted.blastRadius.outboundRequests.every((request) => request.billable === false)).toBe(true);
    // 自检过了也消不掉这一条：只有用户真跑一次才能。
    expect(submitted.unverified.map((entry) => entry.claim)).toContain("model_produces_output");
    expect(certification.startHttp).toHaveBeenCalledTimes(1);

    // ④ 终态照旧读得回来。
    const final = await call(read, { target: "setup", setupId: connected.setupId }) as { stage: string };
    expect(final.stage).toBe("completed");

    // ⑤ 删除要指纹：`nomi_read target=models` 给什么，`ifUnchanged` 就填什么（同一个函数算的）。
    const models = await call(read, { target: "models" }) as { fingerprint: string };
    expect(models.fingerprint).toMatch(/^models-[0-9a-f]{12}$/);

    // 入参一次写对率：这一整轮里没有任何一步被对外 schema 打回。
    const firstTryRate = (attempted.length - rejectedBySchema.length) / attempted.length;
    expect(rejectedBySchema).toEqual([]);
    expect(firstTryRate).toBeGreaterThanOrEqual(0.9);
    expect(attempted.length).toBeGreaterThanOrEqual(5);
  });

  it("陈旧指纹的删除被拒，且什么都没删（撤不回的那一格必须先证明你看的是现在）", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-onboarding-remove-"));
    const { sessions } = makeService(dir);
    const ctx = { integrationSessions: sessions, origin: { host: HOST } } as never;
    const removeTool = MCP_TOOL_RESOLVER.resolve("nomi_remove_provider")!;
    const args = { vendorKey: "deepseek", ifUnchanged: "models-000000000000" };
    expect(validateToolArguments(removeTool.name, removeTool.inputSchema, args)).toBeNull();
    const refused = await dispatch(removeTool.method, removeTool.build(args) as Record<string, unknown>, ctx) as { ok: boolean; code: string };
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("stale_fingerprint");
  });
});
