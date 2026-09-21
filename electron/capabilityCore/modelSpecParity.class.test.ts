// 类级回归：**同一个模型经两个入口拿到的说明书必须逐字段一致**，且两档分级都真的分级了。
//
// 这条测试是本刀的验收门第 3 条（2026-09-21 任务书）：
// 「同一模型经 `list_models`（应用内面）与 `nomi_read{target:"model"}`（外部面）
//  拿到的详情逐字段一致 —— 防以后再漂移」。
//
// 为什么这条必须存在：漂移正是这一族缺陷的形状。两个面各写各的投影时，
// 谁也不会红；直到用户在外部宿主里发现「Nomi 说这个模型没有 720p」才暴露。
import { describe, expect, it } from "vitest";

import { applyBuiltinSeeds } from "../catalog/seedBuiltins";
import { agentModelEntriesFromCatalog } from "../catalog/agentModelEntriesFromCatalog";
import { createLaneModelRead } from "../agentLane/laneModelRead.mjs";
import { findModelEntry, modelSpecDetail, modelSpecRow } from "../shared/agentCapabilities/modelSpecProjection";

const state = applyBuiltinSeeds(
  { version: 4, vendors: [], models: [], mappings: [], apiKeysByVendor: {} },
  "2026-09-22T00:00:00.000Z",
).state;
const catalog = agentModelEntriesFromCatalog(state);
const entries = catalog.map((row) => row.entry);
const availabilityOf = (entry: typeof entries[number]) =>
  catalog.find((row) => row.entry.modelId === entry.modelId && row.entry.vendor === entry.vendor)?.availability;

/** 应用内那一面：真的 lane 工具，不是手写的等价物。 */
const laneTool = createLaneModelRead(() => entries, availabilityOf);
const laneCall = async (args: { kind?: string; modelId?: string }) =>
  (await laneTool.execute("call-1", args)).details as Record<string, unknown>;

/** 外部 MCP 那一面：与 `dispatcher` 的 `models.list` / `models.read` 用的是同一对函数。 */
const mcpThin = () => entries.map((entry) => modelSpecRow(entry, availabilityOf(entry)));
const mcpDetail = (modelId: string) => {
  const entry = findModelEntry(entries, modelId);
  return entry ? modelSpecDetail(entry, availabilityOf(entry)) : null;
};

const sampleIds = ["gpt-image-2", "doubao-seedance-2.0"].filter((id) => findModelEntry(entries, id));

describe("model spec parity across the two model faces", () => {
  it("the seeded catalog really carries the models this test is about", () => {
    expect(entries.length).toBeGreaterThan(50);
    expect(sampleIds.length).toBeGreaterThan(0);
  });

  it.each(sampleIds)("%s reads field-for-field identical through both faces", async (modelId) => {
    const lane = (await laneCall({ modelId })).model;
    expect(lane).toEqual(mcpDetail(modelId));
  });

  it("the thin list is identical through both faces", async () => {
    expect((await laneCall({})).models).toEqual(mcpThin());
  });

  it("the thin tier really is thin — no params, no slots, no mode prose", async () => {
    const rows = (await laneCall({})).models as Array<Record<string, unknown>>;
    for (const row of rows.slice(0, 20)) {
      expect(row).not.toHaveProperty("modes");
      expect(row).not.toHaveProperty("params");
      expect(JSON.stringify(row)).not.toContain("vendorTerm");
    }
  });

  it("the detail tier carries what the thin tier withheld", async () => {
    const modelId = sampleIds[0]!;
    const detail = (await laneCall({ modelId })).model as Record<string, unknown>;
    expect(Array.isArray(detail.modes)).toBe(true);
    expect((detail.modes as unknown[]).length).toBeGreaterThan(0);
  });

  it("carries availability on both faces (it used to exist only on the MCP face)", async () => {
    const lane = (await laneCall({})).models as Array<Record<string, unknown>>;
    expect(lane[0]).toHaveProperty("usable");
    expect(lane[0]).toHaveProperty("keyStatus");
    expect(lane[0]).toHaveProperty("statusReason");
    expect(mcpThin()[0]).toHaveProperty("statusReason");
  });

  it("makes variants discoverable, because admission already refuses unknown ones", async () => {
    // 「可被拒、不可发现」是 2026-09-22 验收点名的新不对称。
    const withVariants = entries.find((entry) => (entry.variants?.length ?? 0) > 0);
    expect(withVariants, "the seeded catalog has no model with variants — premise gone").toBeTruthy();
    const detail = (await laneCall({ modelId: withVariants!.modelId })).model as Record<string, unknown>;
    expect((detail.variants as unknown[]).length).toBeGreaterThan(0);
    const thin = mcpThin().find((row) => row.modelId === withVariants!.modelId);
    expect(thin?.variantIds?.length).toBeGreaterThan(0);
  });

  it("refuses an unknown modelId with a way forward, on the lane face too", async () => {
    const payload = await laneCall({ modelId: "no-such-model-anywhere" });
    expect(payload.model).toBeNull();
    expect(String(payload.recoveryActions)).toContain("list_models");
  });
});
