/**
 * 连接身份派生规则（issue #831）。
 *
 * 这里钉死的是「同域名多条连接」的全部可观察行为，包括两条最容易被后人「顺手优化」掉的：
 *   · 第一条连接的 key 与改之前**逐字相同**（存量目录零迁移）；
 *   · 改名**不**换 key（换 key = 模型/偏好/历史全部搬家）。
 */
import { describe, expect, it } from "vitest";
import {
  builtinVendorKeyOfKey,
  composeConnectionVendorKey,
  isVendorOfBuiltin,
  slugifyConnectionName,
} from "../shared/builtinVendorIdentity";
import { resolveConnectionVendorKey } from "./connectionVendorKey";

/** 只关心 key 的用例用它；名字留空（= slug 为空，永远不会和真名字撞）。 */
const vendors = (...keys: string[]) => keys.map((key) => ({ key, name: "" }));

describe("slugifyConnectionName", () => {
  it("只保留 ASCII 字母数字，折叠连写、去首尾连字符", () => {
    expect(slugifyConnectionName("Mini 特价组")).toBe("mini");
    expect(slugifyConnectionName("  Fast__Tier  ")).toBe("fast-tier");
    expect(slugifyConnectionName("0.4x / cheap")).toBe("0-4x-cheap");
  });

  it("纯中文 / 纯符号 → 空 slug（调用方据此走「更新那条 host 连接」）", () => {
    expect(slugifyConnectionName("满血组")).toBe("");
    expect(slugifyConnectionName("———")).toBe("");
    expect(slugifyConnectionName("")).toBe("");
  });

  it("不许伪装成认证候选（`--candidate-…` 是保留形状）", () => {
    expect(slugifyConnectionName("candidate")).toBe("n-candidate");
    expect(slugifyConnectionName("Candidate 7")).toBe("n-candidate-7");
  });

  it("截断后不留尾随连字符", () => {
    const slug = slugifyConnectionName("a".repeat(30));
    expect(slug).toBe("a".repeat(24));
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("resolveConnectionVendorKey", () => {
  const baseUrl = "https://gw.example.test/v1";
  const hostKey = "gw-example-test";

  it("第一条连接 = host 段本身（与改之前逐字相同 → 存量目录零迁移）", () => {
    expect(resolveConnectionVendorKey({ baseUrl, name: "满血组", vendors: [] })).toBe(hostKey);
    expect(resolveConnectionVendorKey({ baseUrl, name: "Mini", vendors: [] })).toBe(hostKey);
  });

  it("host 已被占 + 新名字 → 兄弟连接 key", () => {
    expect(resolveConnectionVendorKey({ baseUrl, name: "Mini 特价组", vendors: vendors(hostKey) }))
      .toBe(`${hostKey}--mini`);
  });

  it("同域名同名 = 更新那条连接，不加 -2 后缀", () => {
    const state = vendors(hostKey, `${hostKey}--mini`);
    expect(resolveConnectionVendorKey({ baseUrl, name: "Mini 特价组", vendors: state })).toBe(`${hostKey}--mini`);
  });

  it("slug 撞车视为同名（不静默新建第二条）", () => {
    const state = vendors(hostKey, `${hostKey}--mini`);
    // 「Mini 特价组」与「mini-特价」slug 都是 mini。
    expect(resolveConnectionVendorKey({ baseUrl, name: "mini-特价", vendors: state })).toBe(`${hostKey}--mini`);
  });

  it("host 已被占 + 名字为空/纯中文 → 落回 host 那条（= 更新它）", () => {
    const state = vendors(hostKey);
    expect(resolveConnectionVendorKey({ baseUrl, name: "", vendors: state })).toBe(hostKey);
    expect(resolveConnectionVendorKey({ baseUrl, name: "满血组", vendors: state })).toBe(hostKey);
  });

  it("重新保存同一条连接（同域名同名）落回它自己，不长出兄弟", () => {
    // 第一条连接的 key 是裸 root，名字却可以是任何东西。同名判定必须比**名字**，
    // 比 key 空间会把「重新保存」误判成「新建兄弟」，凭据随即找不到。
    const state = [{ key: hostKey, name: "Saved Gateway" }];
    expect(resolveConnectionVendorKey({ baseUrl, name: "Saved Gateway", vendors: state })).toBe(hostKey);
  });

  it("重新保存一条兄弟连接落回那条兄弟", () => {
    const state = [
      { key: hostKey, name: "满血组" },
      { key: `${hostKey}--mini`, name: "Mini 特价组" },
    ];
    expect(resolveConnectionVendorKey({ baseUrl, name: "Mini 特价组", vendors: state })).toBe(`${hostKey}--mini`);
  });

  it("调用方给了 rootVendorKey 就按它当 root，不再从 baseUrl 重算", () => {
    expect(resolveConnectionVendorKey({
      rootVendorKey: "saved-gateway",
      baseUrl,
      name: "Saved Gateway",
      vendors: [],
    })).toBe("saved-gateway");
  });

  it("给了 catalogVendorKey 就按它 —— 编辑既有连接不被名字带跑（改名不换 key）", () => {
    const state = vendors(hostKey, `${hostKey}--mini`);
    expect(resolveConnectionVendorKey({
      baseUrl,
      name: "改了个全新的名字",
      vendors: state,
      catalogVendorKey: `${hostKey}--mini`,
    })).toBe(`${hostKey}--mini`);
  });

  it("既没有 catalogVendorKey 也没有可解析的 baseUrl → 抛，不猜一个默认", () => {
    expect(() => resolveConnectionVendorKey({ baseUrl: "", name: "x", vendors: [] })).toThrow();
    expect(() => resolveConnectionVendorKey({ baseUrl: "not a url", name: "x", vendors: [] })).toThrow();
  });

  it("内置 host 的第一条连接仍解析成内置 key（火山别名表不被本次改动破坏）", () => {
    expect(resolveConnectionVendorKey({
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      name: "我的方舟",
      vendors: [],
    })).toBe("volcengine");
  });

  it("内置家的第二条连接是兄弟，不是覆盖", () => {
    expect(resolveConnectionVendorKey({
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      name: "Cheap tier",
      vendors: vendors("volcengine"),
    })).toBe("volcengine--cheap-tier");
  });
});

describe("身份解析（兄弟连接认得回内置家）", () => {
  it("builtinVendorKeyOfKey 取 root 段", () => {
    expect(builtinVendorKeyOfKey("apimart")).toBe("apimart");
    expect(builtinVendorKeyOfKey("apimart--mini")).toBe("apimart");
    expect(builtinVendorKeyOfKey("apimart--candidate-0123456789abcdef")).toBe("apimart");
    expect(builtinVendorKeyOfKey("gw-example-test--mini")).toBe("gw-example-test");
    expect(builtinVendorKeyOfKey("")).toBe("");
  });

  it("isVendorOfBuiltin 认 lineage 登记的 root", () => {
    const rows = [
      { key: "apimart" },
      { key: "apimart--mini", meta: { adapterCandidateRootVendorKey: "apimart" } },
      { key: "gw-example-test" },
    ];
    expect(isVendorOfBuiltin(rows, "apimart", "apimart")).toBe(true);
    expect(isVendorOfBuiltin(rows, "apimart--mini", "apimart")).toBe(true);
    expect(isVendorOfBuiltin(rows, "gw-example-test", "apimart")).toBe(false);
    expect(isVendorOfBuiltin(rows, "", "apimart")).toBe(false);
  });

  it("vendors 里查不到这条时退回 key 形状解析，不静默返回空", () => {
    expect(isVendorOfBuiltin([], "apimart--mini", "apimart")).toBe(true);
  });

  it("composeConnectionVendorKey：slug 为空或 root 为空 → 空串（调用方走同名分支）", () => {
    expect(composeConnectionVendorKey("apimart", "满血组")).toBe("");
    expect(composeConnectionVendorKey("", "mini")).toBe("");
    expect(composeConnectionVendorKey("apimart", "Mini")).toBe("apimart--mini");
  });
});
