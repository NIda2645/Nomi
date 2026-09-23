/**
 * 「同一个模型，先走哪家」对等 —— **界面显示哪家，钱就得花在哪家**。
 *
 * 两处调用点，一份规则：
 *   · 渲染层选择器 —— `src/config/modelIdentity.ts` 的 `sortModelProviders`（模型框里那几家的顺序）
 *     与 `pickImplicitVendorMatch`（只记了模型名、没记供应商的旧选择读回哪一家）。
 *   · 主进程执行侧 —— `electron/catalog/executableModel.ts` 的 `findExecutableModelAnyVendor`
 *     （经 `orderByVendorPreference`），以及 Agent 面板/画布那条 `buildModelEntryIndex` 的裸 key 回落。
 *
 * 2026-09-22 总合并之前这是**两份规则**：渲染层有「用户排过的顺序 → 供应商分级 → 字母序」三级（#832），
 * 执行侧的 `orderByVendorPreference` 只有第一级。用户没排过序时，界面按分级把内置中转排在前面，
 * 执行侧却按目录原序挑了用户刚自接的那家——两边看上去都对，钱花在另一家。
 *
 * 用户 2026-09-22 拍板「按照默认走」：没排过序、同名模型既有内置中转又有自接中转时，
 * **内置中转优先、自接靠后**。本文件按这条裁决逐条对拍，覆盖任务书点名的两种情形：
 * ① 自接入供应商；② 用户重排过顺序（用户说过的话比分级强）。
 *
 * 纯函数对拍：两侧比较的是同一个 `compareVendorLanding`，这里把两侧各自的**调用形状**都喂一遍，
 * 断言它们对同一批候选给出同一个「第一家」。
 */
import { describe, expect, it } from "vitest";

import {
  compareVendorLanding,
  orderByVendorPreference,
  vendorTier,
} from "../shared/contracts/vendorPreference";
import { pickImplicitVendorMatch, sortModelProviders } from "../../src/config/modelIdentity";

/** 目录原序刻意是「新接入的在前」——自接那家排第一，正是 2026-09-21 群反馈的那个形状。 */
const CATALOG_ORDER = ["my-relay-example-com", "apimart", "volcengine"] as const;

type Row = { vendor: string; modelKey: string };
const rows: Row[] = CATALOG_ORDER.map((vendor) => ({ vendor, modelKey: "gpt-image-2" }));

/** 渲染层选择器那一侧的形状：`ModelProviderRef` 带一个显示名。 */
const providerRefs = rows.map((row) => ({
  vendor: row.vendor,
  option: { value: row.modelKey, label: "GPT Image 2", modelKey: row.modelKey, vendor: row.vendor, vendorName: vendorNameOf(row.vendor), kind: "image" as const },
}));

function vendorNameOf(vendor: string): string {
  // 刻意让自接那家的显示名字母序最靠前（"A my relay"）：只有分级这一级还在，它才不会被字母序顶到第一。
  return vendor === "my-relay-example-com" ? "A my relay" : vendor === "apimart" ? "APIMart" : "Volcengine";
}

/** 执行侧那一侧的形状：只有 vendorKey，没有显示名。 */
const executionRows = rows.map((row) => ({ vendorKey: row.vendor, modelKey: row.modelKey }));

const firstOf = <T>(entries: readonly T[], vendorOf: (entry: T) => string, ordered: readonly string[]): string =>
  vendorOf(orderByVendorPreference(entries, ordered, vendorOf)[0]!);

describe("供应商落家：渲染层与执行侧同一把尺", () => {
  it("用户没排过序、同名模型既有内置中转又有自接：内置中转优先（用户 2026-09-22「按照默认走」）", () => {
    const ordered: string[] = [];
    // 用户镜头里的那一幕：他刚自接了一个也叫 gpt-image-2 的模型，目录把新接入的排在前面。
    const relayVsSelfHosted = rows.filter((row) => row.vendor !== "volcengine");
    const relayVsSelfHostedExec = executionRows.filter((row) => row.vendorKey !== "volcengine");
    const relayVsSelfHostedRefs = providerRefs.filter((ref) => ref.vendor !== "volcengine");
    // ① 执行侧（findExecutableModelAnyVendor 的那条路）
    expect(firstOf(relayVsSelfHostedExec, (row) => row.vendorKey, ordered)).toBe("apimart");
    // ② 渲染层选择器的那几家顺序（自接那家显示名字母序更靠前，分级这一级还在才不会被它顶到第一）
    expect(sortModelProviders(relayVsSelfHostedRefs as never, ordered).map((ref) => (ref as { vendor: string }).vendor))
      .toEqual(["apimart", "my-relay-example-com"]);
    // ③ 只记了模型名、没记供应商的旧选择读回哪一家
    expect(pickImplicitVendorMatch(relayVsSelfHosted, (row) => row.vendor, ordered)?.vendor).toBe("apimart");
  });

  it("官方 > 内置中转 > 自接：三级分级两侧逐字一致", () => {
    expect([vendorTier("volcengine"), vendorTier("apimart"), vendorTier("my-relay-example-com")]).toEqual([0, 1, 2]);
    const ordered: string[] = [];
    expect(firstOf(executionRows, (row) => row.vendorKey, ordered)).toBe("volcengine");
    expect(pickImplicitVendorMatch(rows, (row) => row.vendor, ordered)?.vendor).toBe("volcengine");
    expect(sortModelProviders(providerRefs as never, ordered).map((ref) => (ref as { vendor: string }).vendor))
      .toEqual(["volcengine", "apimart", "my-relay-example-com"]);
  });

  it("用户重排过顺序：用户说过的话比分级强，两侧都听他的", () => {
    // 用户把自接那家排到了最前面——分级说它最后，用户说它第一，听用户的。
    const ordered = ["my-relay-example-com", "volcengine", "apimart"];
    expect(firstOf(executionRows, (row) => row.vendorKey, ordered)).toBe("my-relay-example-com");
    expect(pickImplicitVendorMatch(rows, (row) => row.vendor, ordered)?.vendor).toBe("my-relay-example-com");
    expect(sortModelProviders(providerRefs as never, ordered).map((ref) => (ref as { vendor: string }).vendor))
      .toEqual(["my-relay-example-com", "volcengine", "apimart"]);
  });

  it("大小写与空白不算两家：设置里存的和目录里的不必一模一样", () => {
    expect(compareVendorLanding("APIMart", "my-relay-example-com", [" apimart "])).toBeLessThan(0);
  });

  it("类：任取一个排序，两侧对「第一家」永远给同一个答案（自接家在列）", () => {
    const orderings: string[][] = [
      [],
      ["apimart"],
      ["my-relay-example-com"],
      ["volcengine", "my-relay-example-com"],
      ["my-relay-example-com", "apimart", "volcengine"],
      ["unknown-vendor"],
    ];
    for (const ordered of orderings) {
      const execution = firstOf(executionRows, (row) => row.vendorKey, ordered);
      const implicit = pickImplicitVendorMatch(rows, (row) => row.vendor, ordered)?.vendor;
      const picker = (sortModelProviders(providerRefs as never, ordered)[0] as { vendor: string }).vendor;
      expect({ ordered, execution, implicit, picker }).toEqual({ ordered, execution, implicit: execution, picker: execution });
    }
  });
});
