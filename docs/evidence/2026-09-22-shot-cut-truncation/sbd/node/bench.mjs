import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import os from "node:os";
import path from "node:path";
const W = "/Users/aoqimin/Desktop/Nomi/.claude/worktrees/video-breakdown-clips-analysis-4c4bbf";
const S = process.env.S;
const ORT_DIST = path.join(W, "node_modules/onnxruntime-web/dist");
const ort = await import(path.join(ORT_DIST, "ort.wasm.bundle.min.mjs"));
const ARG = process.argv[2] || "1";
const NUM_THREADS = ARG === "default" ? null : Number(ARG);
const N_WINDOWS = Number(process.argv[3] || 20);

ort.env.wasm.wasmPaths = ORT_DIST + "/";
if (NUM_THREADS !== null) ort.env.wasm.numThreads = NUM_THREADS;
ort.env.wasm.simd = true;
ort.env.logLevel = "error";

const modelPath = path.join(S, "sbd/transnetv2.onnx");
const t0 = performance.now();
let sess;
try {
  sess = await ort.InferenceSession.create(fs.readFileSync(modelPath), {
    executionProviders: ["wasm"], graphOptimizationLevel: "all",
  });
} catch (e) {
  console.error("SESSION_CREATE_FAILED:", e && e.stack ? e.stack : String(e));
  process.exit(3);
}
const tLoad = performance.now() - t0;
console.log(`ort-web ${ort.env.versions?.web ?? "?"}  threads=${ort.env.wasm.numThreads}  session load ${tLoad.toFixed(0)} ms`);
console.log("inputs", sess.inputNames, "outputs", sess.outputNames);

// real frames
const raw = fs.readFileSync(path.join(S, "sbd/results/F1-frames-48x27.raw"));
const FRAME = 27 * 48 * 3;
const nFrames = raw.length / FRAME;
// official padding: 25 copies of frame0 at start
const padded = Buffer.concat([
  ...Array.from({ length: 25 }, () => raw.subarray(0, FRAME)),
  raw,
  ...Array.from({ length: 25 + 50 - (nFrames % 50 || 50) }, () => raw.subarray((nFrames - 1) * FRAME, nFrames * FRAME)),
]);
const totalWindows = Math.floor((padded.length / FRAME - 100) / 50) + 1;
const nRun = Math.min(N_WINDOWS, totalWindows);

const dims = [1, 100, 27, 48, 3];
const times = [];
let firstOut = null;
for (let w = 0; w < nRun; w++) {
  const off = w * 50 * FRAME;
  const data = new Uint8Array(padded.subarray(off, off + 100 * FRAME));
  const t = new ort.Tensor("uint8", data, dims);
  const s = performance.now();
  const out = await sess.run({ frames: t });
  times.push(performance.now() - s);
  if (w === 0) firstOut = Array.from(out.single_frame_pred.data.slice(25, 75));
}
times.sort((a, b) => a - b);
const mean = times.reduce((a, b) => a + b, 0) / times.length;
const perWindow = mean;                       // ms per 100-frame window (=50 new frames)
const fps = 50000 / perWindow;                // frames/s of video covered
const secPerMinVideo = (60 * 30) / fps;       // 30fps video
const med = times[Math.floor(times.length/2)], mn = times[0];
const spm = (ms) => (60*30)/(50000/ms);
console.log(`windows=${nRun}/${totalWindows}  min ${mn.toFixed(1)} ms  median ${med.toFixed(1)}  mean ${perWindow.toFixed(1)}  max ${times[times.length-1].toFixed(1)}`);
console.log(`=> 秒/每分钟30fps视频:  最好 ${spm(mn).toFixed(1)}   中位 ${spm(med).toFixed(1)}   平均 ${spm(perWindow).toFixed(1)}`);
console.log(`LOADAVG ${require('node:os').loadavg().map(x=>x.toFixed(1)).join(' ')}`);
fs.writeFileSync(path.join(S, `sbd/results/bench-wasm-t${ARG}.json`), JSON.stringify({threads: ort.env.wasm.numThreads, min_ms: mn, median_ms: med, mean_ms: perWindow, s_per_min_best: spm(mn), s_per_min_median: spm(med), n: nRun, load: require('node:os').loadavg()}, null, 1));
fs.writeFileSync(path.join(S, `sbd/results/wasm-first-window-t${ARG}.json`), JSON.stringify(firstOut));
