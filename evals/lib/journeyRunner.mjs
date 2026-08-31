// Lane C 完整用户流程评测——旅程编排器(τ-bench 多轮 + WebArena 终态功能验证)。
// 一条旅程 = 有序里程碑,在「同一个隔离 app 的连续会话」里逐个走(不是每步换新 app),
// 每个里程碑走完做一次终态功能验证(读落盘 project.json/events,不比对轨迹、不信 agent 自述)。
//
// 复用 isoApp 全部原语(隔离/启动/多轮批准/终态持久化),不另造隔离或输出管线(P1)。
// 安全:say 里程碑走 approveUntilTurnEnds 的 TOOL_WHITELIST,run_generation_batch 等花钱工具
// 默认被拒;旅程级再兜底断言 zeroVendorCalls(评测验「可以生成了」终态,绝不真生成)。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  prepareIsolation,
  launchIsolatedApp,
  openGenerationAiPanel,
  setAssistantModelPref,
  readAssistantModelLabel,
  sendAgentMessage,
  approveUntilTurnEnds,
  countFinishedTurns,
  waitForPersistedCanvas,
  readEventsLog,
  readProjectPayload,
} from "./isoApp.mjs";
import { INFRA_ERROR_PATTERN } from "./grading.mjs";

/** 一条 check 结果(analytic:逐条独立,为 Lane A 维度分预留 dimension 槽)。 */
export function check(label, pass, reason = "", dimension = "behavior") {
  return { label, pass: Boolean(pass), reason: String(reason || ""), dimension };
}

/** 里程碑执行后构造给 verify 用的上下文:终态取证都从落盘读,win 仅供 UI 几何/交互态用。 */
function buildCtx(win, projectDir, iso, baselineNodeIds, repoRoot, app = null) {
  const record = () => readProjectPayload(projectDir);
  const canvas = () => record()?.payload?.generationCanvas || { nodes: [], edges: [] };
  const nodes = () => canvas().nodes || [];
  const baseline = new Set(baselineNodeIds);
  return {
    win,
    // app(Electron 实例,主进程上下文):仅额度门旅程在主进程内解密 app key 调视觉模型时用
    // (复用 appBridge.chatVision 机制,不另启第二个 app)。普通旅程无需,留 null 安全。
    app,
    projectDir,
    iso,
    repoRoot,
    record,
    events: () => readEventsLog(projectDir),
    nodes,
    edges: () => canvas().edges || [],
    /** 本旅程新建的节点(终态 − 基线)。 */
    created: () => nodes().filter((n) => !baseline.has(n.id)),
    /** 节点间引用边(仅算两端都在的)。 */
    chainEdges: () => {
      const ids = new Set(nodes().map((n) => n.id));
      return (canvas().edges || []).filter((e) => ids.has(e.source) && ids.has(e.target));
    },
  };
}

function isInfraTurn(turn) {
  if (!turn) return false;
  return turn.status === "error" && INFRA_ERROR_PATTERN.test(String(turn.errorMessage || ""));
}

function evidenceFileName(journeyId, trial, milestoneId) {
  const safe = (value) => String(value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `${safe(journeyId)}-t${trial}-${safe(milestoneId)}.png`;
}

async function captureEvidence(win, repoRoot, evidenceDir, journeyId, trial, milestoneId) {
  if (!evidenceDir || !win) return null;
  fs.mkdirSync(evidenceDir, { recursive: true });
  const outputPath = path.join(evidenceDir, evidenceFileName(journeyId, trial, milestoneId));
  await win.screenshot({ path: outputPath });
  return {
    milestoneId,
    path: path.relative(repoRoot, outputPath),
    bytes: fs.statSync(outputPath).size,
  };
}

async function resizeForEvidence(app, win) {
  try {
    const browserWindow = await app.browserWindow(win);
    await browserWindow.evaluate((window) => {
      window.setBounds({ width: 1680, height: 1050 });
      window.center();
    });
    await win.waitForTimeout(300);
  } catch {
    // Headless/CI window managers may reject bounds changes; screenshots still remain usable.
  }
}

async function closeElectronApp(app, log) {
  const closed = await Promise.race([
    app.close().then(() => true).catch(() => false),
    new Promise((resolve) => setTimeout(() => resolve(false), 8_000)),
  ]);
  if (closed) return;
  log("  ! Electron graceful close timed out; terminating isolated main process");
  app.process().kill("SIGKILL");
  await new Promise((resolve) => setTimeout(resolve, 300));
}

/**
 * 跑一条旅程一次(一个 trial)。返回 {journeyId, trial, milestones:[...], pass, score, metrics, failureReason}。
 * milestones 里每个含 {id, title, checks:[{label,pass,reason,dimension}], pass, turn?}。
 * 任一里程碑 infra 错误 → 该里程碑标 infra、终止后续(整轮记 failureReason=error,可重试)。
 */
export async function runJourneyTrial(
  repoRoot,
  journey,
  { trial = 1, modelPref = null, evidenceDir = null, log = () => {} } = {},
) {
  const isoDir = path.join(os.tmpdir(), "nomi-journey", `${journey.id}-t${trial}`);
  const result = {
    journeyId: journey.id,
    name: journey.name,
    trial,
    milestones: [],
    pass: false,
    score: 0,
    metrics: { latencyMs: 0, tokensTotal: 0 },
    evidence: [],
    failureReason: null,
  };
  const t0 = Date.now();
  let app = null;
  let win = null;
  try {
    // needsAgent 的旅程要真实 catalog;纯 UI 旅程(needsAgent=false)不需要 key。
    const iso = prepareIsolation(isoDir, { requireCatalog: Boolean(journey.needsAgent) });
    // Existing-project/upgrade journeys must seed disk state before Electron's main process
    // performs its first project scan. setup remains the user-visible interaction phase.
    const prepared = journey.prepare
      ? await journey.prepare({ iso, repoRoot, log })
      : null;
    const launched = await launchIsolatedApp(repoRoot, iso);
    app = launched.app;
    win = launched.win;
    await resizeForEvidence(app, win);

    // setup:返回 projectDir(各旅程自定义:新建空白 / 点示例 / 打开已有)。
    const projectDir = await journey.setup({ win, iso, repoRoot, prepared, log });
    if (journey.needsAgent) {
      await openGenerationAiPanel(win);
      if (modelPref) await setAssistantModelPref(win, modelPref);
      result.assistantModel = await readAssistantModelLabel(win);
    }
    // openGenerationAiPanel may create the first empty board so the panel has a canvas host.
    // Treat that infrastructure node as baseline, not as an agent-created journey outcome.
    const baselineRecord = await waitForPersistedCanvas(win, projectDir, { settleMs: 500, timeoutMs: 8000 });
    const baselineNodeIds = (baselineRecord?.payload?.generationCanvas?.nodes || []).map((n) => n.id);
    const ctx = buildCtx(win, projectDir, iso, baselineNodeIds, repoRoot, app);

    for (const milestone of journey.milestones) {
      const mResult = { id: milestone.id, title: milestone.title, checks: [], pass: false };
      log(`  ◆ 里程碑 ${milestone.id} — ${milestone.title}`);

      if (milestone.say) {
        // 多轮安全:每条消息前重数终态轮,只等「之后新出现」的收尾(防上一轮残留假收尾)。
        const baselineTurnCount = countFinishedTurns(ctx.events());
        await sendAgentMessage(win, milestone.say);
        const turn = await approveUntilTurnEnds(win, projectDir, { log, baselineTurnCount });
        await waitForPersistedCanvas(win, projectDir);
        mResult.turn = turn;
        const finished = [...ctx.events()].reverse().find((e) => e.type === "agent.turn.finished");
        result.metrics.tokensTotal += Number(finished?.payload?.usage?.totalTokens) || 0;
        if (isInfraTurn(turn)) {
          mResult.checks.push(check("里程碑 turn 收尾", false, `infra: ${turn?.errorMessage || turn?.status}`));
          result.milestones.push(mResult);
          result.failureReason = "error";
          log(`  ✗ infra 错误,终止旅程`);
          break;
        }
      } else if (milestone.act) {
        await milestone.act(ctx);
        await win.waitForTimeout(800);
      }

      if (milestone.beforeEvidence) {
        await milestone.beforeEvidence(ctx);
        await win.waitForTimeout(300);
      }

      const evidence = await captureEvidence(
        win,
        repoRoot,
        evidenceDir,
        journey.id,
        trial,
        milestone.id,
      );
      if (evidence) {
        mResult.evidence = evidence;
        result.evidence.push(evidence);
      }
      const checks = (await milestone.verify(ctx)) || [];
      mResult.checks = checks;
      mResult.pass = checks.length > 0 && checks.every((c) => c.pass);
      result.milestones.push(mResult);
      log(`  ${mResult.pass ? "✓" : "✗"} ${milestone.id}: ${checks.filter((c) => !c.pass).map((c) => c.label).join(", ") || "全过"}`);
    }

    // 旅程级安全兜底:整条会话不得有真实 vendor 生成调用(验「可以生成了」,不真生成)。
    // NOMI_SPEND_OK 下额度门里程碑会合法真生成,跳过本兜底(由该里程碑自己断言)。
    if (!result.failureReason && !process.env.NOMI_SPEND_OK) {
      const vendorCalls = ctx.events().filter((e) => e.type === "vendor.call.requested").length;
      result.milestones.push({
        id: "_safety",
        title: "评测安全门",
        checks: [check("zeroVendorCalls", vendorCalls === 0, `vendor.call.requested=${vendorCalls}`, "safety")],
        pass: vendorCalls === 0,
      });
    }
  } catch (error) {
    result.failureReason = "error";
    result.error = error instanceof Error ? error.message : String(error);
    log(`  ✗ infra error: ${result.error}`);
    try {
      const evidence = await captureEvidence(win, repoRoot, evidenceDir, journey.id, trial, "error");
      if (evidence) result.evidence.push(evidence);
    } catch {
      // Keep the original journey error as the primary failure.
    }
  } finally {
    if (app) await closeElectronApp(app, log);
    fs.rmSync(isoDir, { recursive: true, force: true });
  }

  result.metrics.latencyMs = Date.now() - t0;
  const allChecks = result.milestones.flatMap((m) => m.checks);
  result.score = allChecks.length ? +(allChecks.filter((c) => c.pass).length / allChecks.length).toFixed(3) : 0;
  result.pass = result.failureReason !== "error" && result.milestones.length > 0 && result.milestones.every((m) => m.pass);
  return result;
}
