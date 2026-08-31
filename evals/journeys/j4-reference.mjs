import fs from "node:fs";
import path from "node:path";
import { check } from "../lib/journeyRunner.mjs";
import { createBlankProject } from "../lib/isoApp.mjs";

function containsFile(root, fileName) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(target);
      else if (entry.name === fileName) return true;
    }
  }
  return false;
}

export default {
  id: "j4-reference",
  name: "参考图驱动生成准备",
  needsAgent: true,
  smoke: false,
  successCriterion: "真实上传本地图片，图片进入项目素材并挂到视频节点参考槽，参数可执行",
  async setup({ win, iso }) {
    return createBlankProject(win, iso.projectsDir);
  },
  milestones: [
    {
      id: "reference-target",
      title: "建立支持图片参考的视频目标",
      say: "创建一个 video 节点，标题为“参考图动画”，提示词写钛灰色便携咖啡机在露营桌上缓慢环绕展示。选择当前可用且支持单张图片参考/图生视频的模型与模式，设置 16:9、5 秒，但不要执行真实生成。",
      verify(ctx) {
        const nodes = ctx.created();
        const target = nodes.find((node) => node.kind === "video" && /参考图动画/.test(String(node.title || "")));
        return [
          check("目标 video 节点存在", Boolean(target), "", "outcome"),
          check("目标绑定模型与 archetype", Boolean(target?.meta?.modelKey && target?.meta?.archetype?.id), JSON.stringify(target?.meta || {}), "outcome"),
          check("目标设置 16:9 和可执行时长", (target?.meta?.aspect_ratio === "16:9" || target?.meta?.size === "16:9") && Number(target?.meta?.duration) > 0, JSON.stringify(target?.meta || {}), "outcome"),
        ];
      },
    },
    {
      id: "upload-reference",
      title: "真实上传图片并挂到节点参考槽",
      async act(ctx) {
        const target = ctx.created().find((node) => node.kind === "video" && /参考图动画/.test(String(node.title || "")));
        if (!target) throw new Error("找不到参考图动画节点");
        await ctx.win.getByRole("button", { name: "适应画布", exact: true }).first().click().catch(() => {});
        const node = ctx.win.locator(`[data-node-id="${target.id}"]`).first();
        await node.click({ position: { x: 24, y: 24 }, timeout: 8_000 });
        const composer = ctx.win.locator(".generation-canvas-v2-node__composer");
        await composer.waitFor({ state: "visible", timeout: 8_000 });
        const addReference = composer.locator([
          'button[aria-label="加参考"]',
          'button[aria-label="添加首帧"]',
          'button[aria-label="添加参考图"]',
          'button[aria-label="添加角色参考"]',
        ].join(",")).first();
        await addReference.click({ timeout: 8_000 });
        const picker = ctx.win.getByTestId("asset-picker");
        await picker.waitFor({ state: "visible", timeout: 8_000 });
        await picker.locator('input[type="file"][aria-label="上传本地文件"]').setInputFiles(path.join(ctx.repoRoot, "resources/onboarding-demo/shot-3.jpg"));
        await ctx.win.waitForTimeout(3_000);
        await ctx.win.keyboard.press("Escape").catch(() => {});
      },
      verify(ctx) {
        const target = ctx.created().find((node) => node.kind === "video" && /参考图动画/.test(String(node.title || "")));
        const serializedMeta = JSON.stringify(target?.meta || {});
        return [
          check("上传图片已复制进项目素材", containsFile(ctx.projectDir, "shot-3.jpg"), ctx.projectDir, "outcome"),
          check("目标节点持久化了本地图片参考", /nomi-local:\/\/asset\//.test(serializedMeta), serializedMeta, "outcome"),
          check("上传后节点仍处于可生成参数状态", Boolean(target?.meta?.modelKey && Number(target?.meta?.duration) > 0), serializedMeta, "outcome"),
        ];
      },
    },
  ],
};
