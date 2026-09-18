// 这条改名**凭什么还留着**的机器判据。
//
// 整条链上只剩这一条 rename（`check_job` / `cancel_job` 的生成域那一半）。它的理由写在
// `JOB_ID_IS_DUAL_DOMAIN` 里：两个域的宿主各有一份持久化，各用各的目录名。理由是**领域约束**，
// 按 R5.5 才算合法偏差；哪天两个域同名了，这条映射就该整个删掉，而下面第一条断言会先红。
import { describe, expect, it } from "vitest";

import { exportReadSemanticInputSchema } from "../exportCapabilities";
import { generationStatusInputSchema } from "../generationPlanSchemas";
import { cancelJobGenerationArgs, checkJobGenerationArgs, JOB_ID_IS_DUAL_DOMAIN } from "./verbDualDomain";
import { objectFieldKeys } from "./verbProjections";

describe("双域动词的那条改名", () => {
  it("两个域的宿主字段名**真的不同**——同名了这条映射就该删，这条断言先红", () => {
    const exportKeys = objectFieldKeys(exportReadSemanticInputSchema.options[0], "export job host");
    const generationKeys = objectFieldKeys(generationStatusInputSchema.options[0], "generation status host");
    expect(exportKeys).toContain("jobId");
    expect(generationKeys).toContain("operationId");
    expect(generationKeys).not.toContain("jobId");
    expect(JOB_ID_IS_DUAL_DOMAIN).toMatch(/jobId/);
    expect(JOB_ID_IS_DUAL_DOMAIN).toMatch(/operationId/);
  });

  it("翻出来的参数过得了生成域那一支的宿主 schema（补上 operation 之后）", () => {
    const read = { operation: "read" as const, ...checkJobGenerationArgs({ jobId: "op-1" }) };
    const cancel = { operation: "cancel" as const, ...cancelJobGenerationArgs({ jobId: "op-1" }) };
    expect(generationStatusInputSchema.safeParse(read).success).toBe(true);
    expect(generationStatusInputSchema.safeParse(cancel).success).toBe(true);
    expect(read).toEqual({ operation: "read", operationId: "op-1" });
  });
});
