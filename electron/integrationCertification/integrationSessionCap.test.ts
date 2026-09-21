/**
 * 「接入会话记录超过 100 条 → 整个 app 启动即静默退出」这一类的回归防线。
 *
 * 为什么单独成文件：这条不变量不是会话状态机的一步，而是**这份持久化状态自己的容量合同**
 * （写时不许越界 + 旧盘越界要能自愈）。它的反例是盘上的数据形状，不是某条转场。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IntegrationSessionService } from "./integrationSession";
import { validateState } from "./integrationSessionRecord";

const CAP = 100;

let capabilityDir: string;
let previousCapabilityDir: string | undefined;

beforeAll(() => {
  // 任何情况下都不许碰用户真实的 ~/.nomi/capability-core。
  previousCapabilityDir = process.env.NOMI_CAPABILITY_DIR;
  capabilityDir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-session-cap-capability-"));
  process.env.NOMI_CAPABILITY_DIR = capabilityDir;
});

afterAll(() => {
  if (previousCapabilityDir === undefined) delete process.env.NOMI_CAPABILITY_DIR;
  else process.env.NOMI_CAPABILITY_DIR = previousCapabilityDir;
  fs.rmSync(capabilityDir, { recursive: true, force: true });
});

function at(index: number): string {
  return new Date(Date.UTC(2026, 8, 1, 0, 0, 0) + index * 60_000).toISOString();
}

function sessionFixture(index: number, stage = "completed"): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: `integration-fixture-${String(index).padStart(3, "0")}`,
    revision: 1,
    ownerClientId: "codex",
    capabilityDigest: "capability-digest",
    kind: "http-api-provider",
    stage,
    configDigest: "config-digest",
    credentialStatus: "ready",
    unresolvedFields: [],
    createdAt: at(index),
    updatedAt: at(index),
    config: { name: `Fixture ${index}`, baseUrl: `https://fixture-${index}.example` },
    candidates: [],
    selections: [],
  };
}

function writeDisk(sessions: Record<string, unknown>[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-session-cap-"));
  const filePath = path.join(dir, "integration-sessions.json");
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, revision: sessions.length, sessions }, null, 2));
  return filePath;
}

function makeService(filePath: string): IntegrationSessionService {
  return new IntegrationSessionService({
    filePath,
    now: () => "2026-09-21T00:00:00.000Z",
    compilerAvailable: () => true,
  });
}

function readDisk(filePath: string): { sessions: Array<Record<string, unknown>> } {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as { sessions: Array<Record<string, unknown>> };
}

describe("integration session capacity", () => {
  it("loads a legacy over-capacity file instead of failing app start, keeping the newest terminal records", () => {
    // 用户盘上的真实形状：101 条、全部终态。修复前这一行就是 app 启动静默退出的那一抛。
    const filePath = writeDisk(Array.from({ length: CAP + 1 }, (_, index) => sessionFixture(index)));
    const service = makeService(filePath);
    const listed = service.list("codex", 1_000).sessions;
    expect(listed).toHaveLength(CAP);
    // 被挤掉的是最旧的那条，不是随便一条。
    expect(listed.map((entry) => entry.id)).not.toContain("integration-fixture-000");
    expect(listed.map((entry) => entry.id)).toContain(`integration-fixture-${String(CAP).padStart(3, "0")}`);
    // 自愈要落盘：下一次启动不能还是 101 条（用户永远不该被要求手工删文件）。
    expect(readDisk(filePath).sessions).toHaveLength(CAP);
  });

  it("never drops an unfinished session when trimming a mixed over-capacity file", () => {
    // 最旧的 5 条是「还在进行中」的草稿：它们恰好是裁剪最容易误伤的那一批。
    const sessions = Array.from({ length: CAP + 10 }, (_, index) =>
      sessionFixture(index, index < 5 ? "draft" : "completed"),
    );
    const filePath = writeDisk(sessions);
    const ids = makeService(filePath).list("codex", 1_000).sessions.map((entry) => entry.id);
    expect(ids).toHaveLength(CAP);
    for (let index = 0; index < 5; index += 1)
      expect(ids).toContain(`integration-fixture-${String(index).padStart(3, "0")}`);
    // 少掉的 10 条全部来自终态那一批，且是其中最旧的 10 条。
    for (let index = 5; index < 15; index += 1)
      expect(ids).not.toContain(`integration-fixture-${String(index).padStart(3, "0")}`);
  });

  it("leaves an exactly-at-capacity file untouched and trims a one-over file by exactly one", () => {
    const exact = writeDisk(Array.from({ length: CAP }, (_, index) => sessionFixture(index)));
    const before = fs.readFileSync(exact, "utf8");
    expect(makeService(exact).list("codex", 1_000).sessions).toHaveLength(CAP);
    expect(fs.readFileSync(exact, "utf8")).toBe(before);

    const over = writeDisk(Array.from({ length: CAP + 1 }, (_, index) => sessionFixture(index)));
    expect(makeService(over).list("codex", 1_000).sessions).toHaveLength(CAP);
  });

  it("keeps an unfinished-only file readable even above the cap, because dropping live work is worse", () => {
    const filePath = writeDisk(Array.from({ length: CAP + 3 }, (_, index) => sessionFixture(index, "draft")));
    expect(() => makeService(filePath)).not.toThrow();
    expect(makeService(filePath).list("codex", 1_000).sessions).toHaveLength(CAP + 3);
  });

  it("bounds the file on the write side: begin() trims instead of growing past the cap", () => {
    const filePath = writeDisk(Array.from({ length: CAP }, (_, index) => sessionFixture(index)));
    const service = makeService(filePath);
    service.begin({ kind: "http-api-provider", name: "New", baseUrl: "https://new.example" }, "codex");
    const persisted = readDisk(filePath).sessions;
    expect(persisted).toHaveLength(CAP);
    expect(persisted.map((entry) => entry.id)).not.toContain("integration-fixture-000");
    expect(persisted.some((entry) => String(entry.config && (entry.config as Record<string, unknown>).name) === "New"))
      .toBe(true);
  });

  it("refuses a new session with a structured code when the cap is full of unfinished work", () => {
    const filePath = writeDisk(Array.from({ length: CAP }, (_, index) => sessionFixture(index, "draft")));
    const service = makeService(filePath);
    let thrown: unknown;
    try {
      service.begin({ kind: "http-api-provider", name: "New", baseUrl: "https://new.example" }, "codex");
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: string } | undefined)?.code).toBe("integration_session_limit_reached");
    // 拒绝必须是干净的：不许留下半条会话。
    expect(readDisk(filePath).sessions).toHaveLength(CAP);
  });

  it("still fails closed on a genuinely malformed record, which is a different problem from too many", () => {
    expect(() => validateState({ version: 1, revision: 1, sessions: [{ ...sessionFixture(0), stage: "bogus" }] }))
      .toThrow(/Invalid integration session record/);
    expect(() => validateState({ version: 2, revision: 1, sessions: [] })).toThrow(/Invalid integration session state/);
  });
});
