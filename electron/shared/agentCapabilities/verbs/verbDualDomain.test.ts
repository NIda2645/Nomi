// 这条改名**凭什么还留着**的机器判据。
//
// 整条链上只剩这一条 rename（`check_job` / `cancel_job` 的生成域那一半）。理由是**领域约束**：
// 两个域的宿主各有一份持久化，各用各的目录名（`jobs/<jobId>/` vs `.nomi/runs/<operationId>/`），
// 按 R5.5 才算合法偏差。哪天两个域同名了，这条映射就该整个删掉——下面第一条断言会先红。
// （那句理由原来还另存了一份字符串常量，测试去 match 里面的词；那是**循环论证**：字符串里写着
// 「两个词不一样」证不了两个词真的不一样。证据只能来自两份宿主 schema 自己，所以常量删了。）
import { describe, expect, it } from "vitest";

import { exportReadSemanticInputSchema } from "../exportCapabilities";
import { generationStatusInputSchema } from "../generationPlanSchemas";
import { cancelJobGenerationArgs, checkJobGenerationArgs } from "./verbDualDomain";
import { objectFieldKeys } from "./verbProjections";

describe("双域动词的那条改名", () => {
  it("两个域的宿主字段名**真的不同**——同名了这条映射就该删，这条断言先红", () => {
    const exportKeys = objectFieldKeys(exportReadSemanticInputSchema.options[0], "export job host");
    const generationKeys = objectFieldKeys(generationStatusInputSchema.options[0], "generation status host");
    expect(exportKeys).toContain("jobId");
    expect(generationKeys).toContain("operationId");
    expect(generationKeys).not.toContain("jobId");
    // 反过来也要真：导出域**没有** operationId。少了这一句，「两个域用两个词」只证了一半。
    expect(exportKeys).not.toContain("operationId");
  });

  it("翻出来的参数过得了生成域那一支的宿主 schema（补上 operation 之后）", () => {
    const read = { operation: "read" as const, ...checkJobGenerationArgs({ jobId: "op-1" }) };
    const cancel = { operation: "cancel" as const, ...cancelJobGenerationArgs({ jobId: "op-1" }) };
    expect(generationStatusInputSchema.safeParse(read).success).toBe(true);
    expect(generationStatusInputSchema.safeParse(cancel).success).toBe(true);
    expect(read).toEqual({ operation: "read", operationId: "op-1" });
  });
});
