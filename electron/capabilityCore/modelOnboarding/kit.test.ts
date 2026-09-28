/**
 * 套件里发出去的东西**自己得是合法的**。
 *
 * 「发给模型的例子本身就过不了我们自己的校验」是这类套件最贵的失败方式：AI 照着改，
 * 改出来的每一张都被拒，而它只会以为是自己写错了。样例是手写的字面量（出处见 `kitExamples.ts`），
 * 所以这条必须由机器守：schema 改了而样例没跟上，这里当场红。
 */
import { describe, expect, it } from "vitest";

import { validateProviderAdapterDraft } from "../../providerAdapter/validator";
import { ONBOARDING_KIT_EXAMPLES } from "./kitExamples";
import { buildOnboardingKit } from "./kit";

describe("接入套件", () => {
  it.each(ONBOARDING_KIT_EXAMPLES.map((example) => [example.name, example] as const))(
    "样例 %s 过得了真实的 validateProviderAdapterDraft",
    (_name, example) => {
      expect(() => validateProviderAdapterDraft(example.card, {
        providerBaseUrl: example.card.provider.baseUrl,
        selectedModelKeys: example.card.models.map((model) => model.modelKey),
      })).not.toThrow();
    },
  );

  it("两半形状各有一份样例：同步一份、异步+轮询一份", () => {
    const deliveries = new Set(
      ONBOARDING_KIT_EXAMPLES.flatMap((example) =>
        example.card.models.flatMap((model) => model.modes.map((mode) => mode.delivery))),
    );
    expect(deliveries).toContain("synchronous");
    expect(deliveries).toContain("asynchronous");
  });

  it("套件无前置可取，且四样东西一次给全", () => {
    const kit = buildOnboardingKit();
    expect(kit.contractSchema).toHaveProperty("$schema");
    // 整张卡的 schema 必须含 provider 块——这条路上连接可能还不存在，卡得自带身份。
    expect(JSON.stringify(kit.contractSchema)).toContain("authScheme");
    expect(kit.instructions.length).toBeGreaterThan(200);
    expect(kit.examples.length).toBeGreaterThanOrEqual(2);
    // 「怎么交」不能只说 action 名：顺序墙删掉之后，最要紧的一句是「不需要先有句柄、先有 key」。
    expect(kit.howToSubmit.action).toMatch(/no handle|no stage/i);
    expect(kit.howToSubmit.credentials).toMatch(/never print it/i);
    expect(kit.howToSubmit.tryOut).toMatch(/try_model/);
  });

  it("样例里一个凭据字段都没有（它是发给外部 AI 的公开数据）", () => {
    const text = JSON.stringify(ONBOARDING_KIT_EXAMPLES);
    for (const forbidden of ["apiKey", "api_key", "Bearer sk-", "secret"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
