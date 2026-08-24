// 设置页「素材上传通道」状态卡的数据源。这张卡的唯一价值是**说真话**——用户照它判断
// 「我的参考图/参考视频会不会跑到公网匿名图床上」。所以这里锁的是三件事：
//   1. 它读的是真解析器的第一名（不是另一套复刻的优先级）；
//   2. 没配 KIE 时视频**必须**如实报成 public-anonymous（不能粉饰）；
//   3. 配了 KIE 之后图片和视频都收敛到 KIE。
import { describe, expect, it } from "vitest";

import { describeAssetTransportChannels } from "./assetTransportDescribe";

const noVendors: Array<{ key?: string }> = [];
const describeWith = (keys: Record<string, string>) =>
  describeAssetTransportChannels({ vendors: noVendors, getApiKey: (key) => keys[key] ?? null });

const byKind = (rows: ReturnType<typeof describeAssetTransportChannels>, kind: string) =>
  rows.find((row) => row.kind === kind);

describe("describeAssetTransportChannels", () => {
  it("一个 key 都没有时：图片和视频都落到匿名公共托管，并如实标 public-anonymous", () => {
    const rows = describeWith({});
    for (const kind of ["image", "video"]) {
      const row = byKind(rows, kind);
      expect(row?.vendorKey).toBeNull();
      expect(row?.visibility).toBe("public-anonymous");
      // 报的是链上真正收文件的第一跳，不是 "anon-chain" 这种内部策略名——用户要看见是谁收了文件。
      expect(row?.host).toBe("litterbox.catbox.moe");
    }
  });

  it("只配 apimart：图片走 apimart 私有链接，视频仍掉到公共托管（apimart 只收图）", () => {
    const rows = describeWith({ apimart: "key-apimart" });
    const image = byKind(rows, "image");
    expect(image?.vendorKey).toBe("apimart");
    expect(image?.visibility).toBe("provider-private");
    expect(image?.host).toBe("api.apimart.ai");
    expect(image?.ttlSeconds).toBe(72 * 60 * 60);

    const video = byKind(rows, "video");
    expect(video?.vendorKey).toBeNull();
    expect(video?.visibility).toBe("public-anonymous");
  });

  it("配了 KIE：图片和视频都收敛到 KIE 的私有链接，视频不再出现在公共图床上", () => {
    const rows = describeWith({ kie: "key-kie", apimart: "key-apimart" });
    const image = byKind(rows, "image");
    expect(image?.vendorKey).toBe("kie");
    expect(image?.host).toBe("kieai.redpandaai.co");

    const video = byKind(rows, "video");
    expect(video?.vendorKey).toBe("kie");
    expect(video?.visibility).toBe("provider-private");
    expect(video?.ttlSeconds).toBe(24 * 60 * 60);
  });

  it("只描述 image / video 两类：音频与视频同路，多列一行只会让卡片更长而不更有信息", () => {
    expect(describeWith({}).map((row) => row.kind)).toEqual(["image", "video"]);
  });
});
