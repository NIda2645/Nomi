// 真素材腿的专用车道（R13「四件真实」第④件）。
//
// 为什么单独一条：这些测试要的是**用户本机那 1.38GB 真素材**（登记表
// tests/ux/real-media-fixtures.json，路径走 env NOMI_REAL_MEDIA_DIR），CI runner 上没有。
// 它们按设计「缺素材就硬红、不 skip」——把它们留在默认车道里，等于让每个 PR 都红在一件
// 与改动无关的事上；而 R17 的教训是：**红灯一旦不可信，这道闸就等于没有**。
//
// 所以分两条车道，而不是给测试加一个「没素材就跳过」的后门（那才是「登记即放绿」）。
// 跑法：
//   export NOMI_REAL_MEDIA_DIR="$HOME/Desktop/视频"
//   pnpm run test:real-media
// 缺素材时这里照样硬红，并打印缺的是哪几件。

import { defineConfig } from "vitest/config";
import base, { BUILD_ARTIFACTS, REAL_MEDIA_TESTS } from "./vitest.config";

// 注意：这里**不能**用 mergeConfig —— 它把数组字段按「拼接」合并，include 会变成
// 「默认车道全量 + 真素材腿」，于是这条车道会把 1507 个单测一起跑掉，而真素材那条
// 反而淹在里面看不出来（实测踩过）。要的是**覆盖**，所以显式展开 base.test。
const baseTest = base.test ?? {};

export default defineConfig({
  ...base,
  test: {
    ...baseTest,
    // 与默认车道读同一个常量：那边 exclude 什么，这边就 include 什么。
    include: REAL_MEDIA_TESTS,
    exclude: [...BUILD_ARTIFACTS],
    // 真 ffmpeg 解一条 9 分钟的 HEVC 再拼联系表，30s 不够；实测两条用例合计 ~49s。
    testTimeout: 300_000,
  },
});
