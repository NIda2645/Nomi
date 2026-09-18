// 投影原型的三条判据（2026-09-18）。它们核的不是「今天这两个字段对不对」，是**投影这件事成不成立**：
// 模型面恰好是宿主面减去宿主自补的那些字段、补完能还原、行为与对照表时代逐字节相同。
import { describe, expect, it } from "vitest";

import { EXPORT_WRITE_ALIASES, exportWriteInputForAlias, exportWriteSemanticInputSchema } from "../exportCapabilities";
import { CANCEL_JOB_HOST_FILL, cancelJobHostArgs, cancelJobModelSchema } from "./cancelJobProjection";
import { objectFieldKeys } from "./verbFieldMap";

const hostSchema = exportWriteSemanticInputSchema.options[1];

describe("cancel_job 的模型面是宿主面的投影，不是第二份 schema", () => {
  it("模型面 = 宿主面 − 宿主自补的字段（两边名单都从各自的 schema 取，不手抄）", () => {
    const hostKeys = objectFieldKeys(hostSchema, "export cancel host");
    const modelKeys = objectFieldKeys(cancelJobModelSchema, "cancel_job model face");
    const filled = Object.keys(CANCEL_JOB_HOST_FILL);
    // 模型面没有任何宿主面之外的字段——这一条排除「投影里偷偷长出第二份形状」。
    expect(hostKeys).toEqual(expect.arrayContaining([...modelKeys]));
    // 差集恰好就是宿主补的那些，一个不多一个不少。
    expect([...modelKeys, ...filled].sort()).toEqual([...hostKeys].sort());
  });

  it("补完重过同一份宿主 schema：藏掉的字段确实只有宿主补得出的那些", () => {
    const modelArgs = cancelJobModelSchema.parse({ jobId: "export-1" });
    expect(cancelJobHostArgs(modelArgs)).toEqual({ jobId: "export-1", operation: EXPORT_WRITE_ALIASES.cancel });
    // 反向：模型那一半单独喂给宿主 schema 必须过不了（否则 `operation` 根本不是宿主自补的字段，
    // 这条投影就是在藏一个模型本该给的值）。
    expect(hostSchema.safeParse(modelArgs).success).toBe(false);
  });

  it("投影出来的宿主输入与既有跨进程准入那条路逐字节相同（换真相源，不换行为）", () => {
    const modelArgs = cancelJobModelSchema.parse({ jobId: "export-1" });
    const { operation: _filled, ...modelHalf } = cancelJobHostArgs(modelArgs);
    expect(exportWriteInputForAlias(EXPORT_WRITE_ALIASES.cancel, modelHalf)).toEqual(cancelJobHostArgs(modelArgs));
  });
});
