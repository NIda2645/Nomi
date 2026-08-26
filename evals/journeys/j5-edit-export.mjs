import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { check } from "../lib/journeyRunner.mjs";
import { dismissSplashIfPresent, waitForPersistedCanvas } from "../lib/isoApp.mjs";

const require = createRequire(import.meta.url);
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
const PROJECT_ID = "j5-existing-project";
const PROJECT_NAME = "已有项目：咖啡机短片";
const NODE_ID = "j5-shot-1";
const NEW_PROMPT = "清晨露营桌上，钛灰色咖啡机被暖阳照亮，镜头缓慢推近，蒸汽清晰可见。";

function seedExistingProject(repoRoot, projectsDir) {
  const projectDir = path.join(projectsDir, PROJECT_NAME);
  const assetDir = path.join(projectDir, "assets", "generated");
  fs.mkdirSync(path.join(projectDir, ".nomi"), { recursive: true });
  fs.mkdirSync(assetDir, { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "resources/onboarding-demo/shot-3.jpg"), path.join(assetDir, "coffee.jpg"));
  const url = `nomi-local://asset/${encodeURIComponent(PROJECT_ID)}/assets/generated/coffee.jpg`;
  const node = {
    id: NODE_ID,
    kind: "image",
    categoryId: "shots",
    title: "镜头 1：露营咖啡机",
    prompt: "旧提示词：咖啡机放在桌上。",
    position: { x: 160, y: 140 },
    exactPosition: true,
    size: { width: 360, height: 280 },
    status: "success",
    result: { id: "j5-result-1", type: "image", url, createdAt: 1 },
  };
  const generationCanvas = {
    nodes: [node],
    edges: [],
    selectedNodeIds: [],
    groups: [],
    canvasZoom: 1,
    canvasPan: { x: 0, y: 0 },
  };
  const timeline = {
    version: 1,
    fps: 24,
    scale: 1,
    playheadFrame: 0,
    tracks: [
      {
        id: "imageTrack",
        type: "image",
        label: "图片轨",
        clips: [{
          id: "j5-clip-1",
          type: "image",
          sourceNodeId: NODE_ID,
          label: "镜头 1",
          startFrame: 0,
          endFrame: 48,
          frameCount: 48,
          offsetStartFrame: 0,
          offsetEndFrame: 0,
          url,
        }],
      },
      { id: "videoTrack", type: "video", label: "视频轨", clips: [] },
      { id: "audioTrack", type: "audio", label: "音频轨", clips: [] },
    ],
    textClips: [],
  };
  const payload = { workbenchDocument: null, timeline, generationCanvas, storyboardPlan: null, storyboardPlanCommitted: false };
  const project = {
    id: PROJECT_ID,
    name: PROJECT_NAME,
    version: 2,
    createdAt: 1,
    updatedAt: Date.now(),
    savedAt: Date.now(),
    revision: 1,
    lastKnownRootPath: projectDir,
    ...payload,
    payload,
  };
  const serialized = JSON.stringify(project, null, 2);
  fs.writeFileSync(path.join(projectDir, "project.json"), serialized);
  fs.writeFileSync(path.join(projectDir, ".nomi", "project.json"), serialized);
  return projectDir;
}

/**
 * 量 composer 卡片的可操作性几何。**只读，不改 DOM**——断言里改样式会污染它自己要验的那个现场。
 *
 * 为什么不能只看「元素可见」：Playwright 的 `isVisible()` 只要求包围盒非空，
 * 被 `overflow-hidden` 裁到卡外的按钮**照样报 visible**。2026-08-26 win32 塌陷里
 * 「有重新生成入口」这条就是这么绿着的，而按钮其实一格都点不到。所以这里量的是
 * 「提示词在卡内露出多高」和「主行动钮是否真的落在卡矩形内」。
 */
async function measureComposerGeometry(win) {
  return win.locator(".generation-canvas-v2-node__composer-card").first().evaluate((element) => {
    const stage = element.closest(".generation-canvas-v2__stage");
    const rect = element.getBoundingClientRect();
    const stageRect = stage?.getBoundingClientRect();
    if (!stageRect) return { withinStage: false, reason: "stage missing" };
    const promptRect = element.querySelector(".generation-canvas-v2-node__prompt-input")?.getBoundingClientRect();
    const actionRect = element.querySelector('button[aria-label="重新生成"]')?.getBoundingClientRect();
    const tolerance = 1;
    const promptVisibleHeight = promptRect
      ? Math.max(0, Math.min(promptRect.bottom, rect.bottom) - Math.max(promptRect.top, rect.top))
      : 0;
    const primaryActionWithinCard = Boolean(actionRect
      && actionRect.top >= rect.top - tolerance
      && actionRect.right <= rect.right + tolerance
      && actionRect.bottom <= rect.bottom + tolerance
      && actionRect.left >= rect.left - tolerance);
    // 失败时的取证包：塌陷是几何问题，只报一个 false 没法隔着 CI 判因。
    const anchor = element.parentElement;
    const nodeRect = anchor?.parentElement?.getBoundingClientRect();
    const handleRect = document.querySelector(".workbench-generation__timeline-handle")?.getBoundingClientRect();
    return {
      withinStage: (
        rect.top >= stageRect.top - tolerance
        && rect.right <= stageRect.right + tolerance
        && rect.bottom <= stageRect.bottom + tolerance
        && rect.left >= stageRect.left - tolerance
      ),
      promptVisibleHeight,
      primaryActionWithinCard,
      composer: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
      stage: { top: stageRect.top, right: stageRect.right, bottom: stageRect.bottom, left: stageRect.left },
      diag: {
        cardHeight: rect.height,
        scrollHeight: element.scrollHeight,
        styleMaxHeight: element.style.maxHeight,
        styleMinHeight: element.style.minHeight,
        flipped: anchor?.getAttribute("data-flipped"),
        node: nodeRect ? { top: nodeRect.top, bottom: nodeRect.bottom, height: nodeRect.height } : null,
        spaceAbove: nodeRect ? nodeRect.top - stageRect.top : null,
        spaceBelow: nodeRect ? stageRect.bottom - nodeRect.bottom : null,
        timelineHandle: handleRect ? { top: handleRect.top, left: handleRect.left, right: handleRect.right } : null,
        hasWindowbar: Boolean(document.querySelector(".workbench-windowbar")),
      },
    };
  }).catch((error) => ({ withinStage: false, reason: String(error) }));
}

async function setWindowContentSize(win, app, width, height) {
  const browserWindow = await app.browserWindow(win);
  await browserWindow.evaluate((window, size) => {
    window.setBounds({ width: size.width, height: size.height });
    window.center();
  }, { width, height });
  await win.waitForTimeout(600);
}

function latestExport(projectDir, startedAt) {
  const exportDir = path.join(projectDir, "exports");
  if (!fs.existsSync(exportDir)) return null;
  return fs.readdirSync(exportDir)
    // ffmpeg 的在写临时文件也叫 .mp4：exportPaths.ts:69 把它命名成 <final>.partial.mp4，
    // 于是 endsWith(".mp4") 必然把半成品当成品捞进来。
    .filter((name) => name.endsWith(".mp4") && !name.endsWith(".partial.mp4"))
    .map((name) => path.join(exportDir, name))
    // stat 只做一次、结果随条目带走。原来 filter 和 sort 各 stat 一次，ffmpeg 在这两次之间
    // 把 .partial.mp4 改名成最终名，第二次 stat 就 ENOENT 抛穿，报成「导出失败」——
    // 而产品其实导出成功了。Windows 导出慢，正好把这个竞态窗口撞开；Linux/mac 只是没撞上，不是没有。
    .flatMap((file) => {
      try {
        const stat = fs.statSync(file);
        return [{ file, mtimeMs: stat.mtimeMs, size: stat.size }];
      } catch {
        return []; // 竞态中被改名/删除的文件跳过即可，不是错误
      }
    })
    .filter((entry) => entry.mtimeMs >= startedAt && entry.size > 0)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.file || null;
}

export default {
  id: "j5-edit-export",
  name: "修改项目并进入导出",
  needsAgent: false,
  smoke: true,
  successCriterion: "打开已有项目，修改 prompt 后重开仍保留，时间轴可见并真实导出有效 MP4",
  async prepare({ iso, repoRoot }) {
    return { projectDir: seedExistingProject(repoRoot, iso.projectsDir) };
  },
  async setup({ win, prepared }) {
    await dismissSplashIfPresent(win);
    const card = win.locator('[data-project-card="true"]', { hasText: PROJECT_NAME }).first();
    await card.waitFor({ state: "visible", timeout: 10_000 });
    await card.click();
    await win.waitForURL(/projectId=/, { timeout: 10_000 });
    return prepared.projectDir;
  },
  milestones: [
    {
      id: "modify-project",
      title: "打开已有节点并修改提示词",
      async act(ctx) {
        await ctx.win.getByRole("button", { name: "生成", exact: true }).first().click();
        await ctx.win.getByRole("button", { name: "适应画布", exact: true }).first().click().catch(() => {});
        const node = ctx.win.locator(`[data-node-id="${NODE_ID}"]`).first();
        await node.click({ position: { x: 24, y: 24 }, timeout: 8_000 });
        const prompt = ctx.win.locator(".generation-canvas-v2-node__prompt-input").first();
        await prompt.waitFor({ state: "visible", timeout: 8_000 });
        await prompt.fill(NEW_PROMPT);
        await prompt.press("Tab");
        await waitForPersistedCanvas(ctx.win, ctx.projectDir, { settleMs: 500, timeoutMs: 8_000 });
      },
      async verify(ctx) {
        const node = ctx.nodes().find((candidate) => candidate.id === NODE_ID);
        const promptText = await ctx.win.locator(".generation-canvas-v2-node__prompt-input").first().innerText().catch(() => "");
        return [
          check("旧节点已打开", Boolean(node), NODE_ID),
          check("新 prompt 已写入 UI", promptText.includes("清晨露营桌上"), promptText),
          check("新 prompt 已持久化", node?.prompt === NEW_PROMPT, node?.prompt || "missing"),
        ];
      },
    },
    {
      id: "reopen-project",
      title: "回到项目库并重开验证持久化",
      async act(ctx) {
        await ctx.win.getByRole("button", { name: "返回项目库", exact: true }).click();
        const card = ctx.win.locator('[data-project-card="true"]', { hasText: PROJECT_NAME }).first();
        await card.waitFor({ state: "visible", timeout: 8_000 });
        await card.click();
        await ctx.win.getByRole("button", { name: "生成", exact: true }).first().click();
        await ctx.win.getByRole("button", { name: "适应画布", exact: true }).first().click().catch(() => {});
        await ctx.win.locator(`[data-node-id="${NODE_ID}"]`).first().click({ position: { x: 24, y: 24 } });
        await ctx.win.locator(".generation-canvas-v2-node__composer").waitFor({ state: "visible", timeout: 8_000 });
      },
      async verify(ctx) {
        const promptText = await ctx.win.locator(".generation-canvas-v2-node__prompt-input").first().innerText().catch(() => "");
        const regenerateVisible = await ctx.win.getByRole("button", { name: "重新生成", exact: true }).first().isVisible().catch(() => false);
        const composerGeometry = await measureComposerGeometry(ctx.win);
        return [
          check("重开后 prompt 没有丢失", promptText.includes("清晨露营桌上"), promptText),
          check("旧结果节点明确提供重新生成入口", regenerateVisible, regenerateVisible ? "" : "regenerate button not visible"),
          check("悬浮编辑器完整位于画布视口内", composerGeometry.withinStage, JSON.stringify(composerGeometry)),
          check("提示词与重新生成控件同时可操作", composerGeometry.promptVisibleHeight >= 20 && composerGeometry.primaryActionWithinCard, JSON.stringify(composerGeometry)),
        ];
      },
    },
    {
      // 回归门（2026-08-26）：composer 在**窗口下限**下仍须可操作。
      //
      // 为什么单独立一条：原 `reopen-project` 那条断言 2026-08-17 就在，win32 上红了 9 天没人看见——
      // 根因是 CI 当时没有 Windows job。但塌陷本身**与平台无关**（mac 上已复刻）：win32 只是恒定少
      // 32px 自绘标题栏（`WorkbenchShell.tsx` 的 windowbar，mac/Linux 走原生 chrome 不渲染），离悬崖最近。
      // 所以与其等一个 2x 计费的 Windows runner，不如把复现条件（窄 stage）直接做进走查——
      // **这条在 Linux CI 上就会红**，本类问题不再依赖「有没有 Windows job」。
      //
      // 1100x720 = BrowserWindow 的 minWidth/minHeight（`electron/main.ts`），即我们承诺支持的最小窗口。
      id: "composer-usable-at-min-window",
      title: "窗口缩到下限后提示词与生成钮仍可操作",
      async act(ctx) {
        await setWindowContentSize(ctx.win, ctx.app, 1100, 720);
        // 先「适应画布」把视口偏移绝对复位，再选中节点——否则会继承上一里程碑挣来的避让平移，
        // 这条就会为了错误的理由变绿（实测栽过：链式改尺寸时旧偏移把空间白送给了下一档）。
        await ctx.win.getByRole("button", { name: "适应画布", exact: true }).first().click().catch(() => {});
        await ctx.win.locator(`[data-node-id="${NODE_ID}"]`).first().click({ position: { x: 24, y: 24 } });
        await ctx.win.locator(".generation-canvas-v2-node__composer").waitFor({ state: "visible", timeout: 8_000 });
        // composer 让位是一段 160ms 的平移动画，量早了会拍到动画中间帧。
        await ctx.win.waitForTimeout(900);
        ctx.minWindowComposer = await measureComposerGeometry(ctx.win);
        // ⚠️ 这里**故意不还原窗口**。harness 的顺序是 act → 截图 → verify，
        // 在 act 末尾还原会让「窗口缩到下限」这条里程碑的取证截图拍到一个宽窗口——
        // 断言量的是窄窗口、截图却是宽窗口，人眼复核时等于零证据（同 e0477f91 治的那一类）。
        // 还原挪到 verify 末尾（截图之后），见下。
      },
      async verify(ctx) {
        const geometry = ctx.minWindowComposer || { reason: "not measured" };
        const evidence = JSON.stringify(geometry);
        try {
          return [
            check("窗口下限下 composer 未塌陷", (geometry.diag?.cardHeight || 0) >= 150, evidence),
            check("窗口下限下提示词与生成钮同时可操作", geometry.promptVisibleHeight >= 20 && geometry.primaryActionWithinCard, evidence),
            check("窗口下限下悬浮编辑器仍在画布视口内", geometry.withinStage === true, evidence),
          ];
        } finally {
          // 截图已在 verify 之前拍完（拍到的是真正被断言的窄窗口），这里再还原给后续里程碑。
          // finally：断言抛了也必须还原，否则导出里程碑会在窄窗口里跑。
          await setWindowContentSize(ctx.win, ctx.app, 1680, 1050);
        }
      },
    },
    {
      id: "export-mp4",
      title: "进入时间轴并真实导出 MP4",
      async act(ctx) {
        await ctx.win.locator('[aria-label="去出片"]:visible').first().click({ timeout: 5_000 });
        await ctx.win.locator('[data-workspace-mode="preview"]').waitFor({ state: "attached", timeout: 8_000 });
        await ctx.win.locator(".workbench-timeline-clip").first().waitFor({ state: "visible", timeout: 10_000 });
        ctx.exportStartedAt = Date.now();
        await ctx.win.getByRole("button", { name: "导出 MP4", exact: true }).first().click();
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
          ctx.exportPath = latestExport(ctx.projectDir, ctx.exportStartedAt);
          if (ctx.exportPath) break;
          await ctx.win.waitForTimeout(1_000);
        }
        if (!ctx.exportPath) throw new Error("120 秒内未找到导出的 MP4");
      },
      verify(ctx) {
        let probe = "";
        try {
          probe = execFileSync(ffprobePath, [
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,width,height,duration",
            "-of", "json",
            ctx.exportPath,
          ], { encoding: "utf8" });
        } catch (error) {
          probe = error instanceof Error ? error.message : String(error);
        }
        return [
          check("时间轴里有已有镜头", true, "j5-clip-1", "outcome"),
          check("真实 MP4 已导出且非空", Boolean(ctx.exportPath && fs.statSync(ctx.exportPath).size > 0), ctx.exportPath || "missing", "outcome"),
          check("ffprobe 识别到视频流", /\"codec_name\"\s*:\s*\"(?:h264|hevc|mpeg4)\"/.test(probe), probe, "outcome"),
        ];
      },
    },
  ],
};
