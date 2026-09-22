import fs from "node:fs"; import path from "node:path";
const W="/Users/aoqimin/Desktop/Nomi/.claude/worktrees/video-breakdown-clips-analysis-4c4bbf";
const S=process.env.S; const ORT=path.join(W,"node_modules/onnxruntime-web/dist");
const ort=await import(path.join(ORT,"ort.wasm.bundle.min.mjs"));
ort.env.wasm.wasmPaths=ORT+"/"; ort.env.logLevel="error";
console.log("DEFAULT ort.env.wasm.numThreads =", ort.env.wasm.numThreads, " simd =", ort.env.wasm.simd,
            " os.cpus=", (await import("node:os")).cpus().length);
