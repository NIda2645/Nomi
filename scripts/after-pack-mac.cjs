const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { prunePlatformBinaries } = require("./packaging/platform-binaries.cjs");

exports.default = async function afterPack(context) {
  const resourcesPath = context.electronPlatformName === "darwin"
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  const unpackedNodeModulesPath = path.join(resourcesPath, "app.asar.unpacked", "node_modules");
  const pruned = prunePlatformBinaries(unpackedNodeModulesPath, context.electronPlatformName, context.arch);
  console.log(`[afterPack] target ${pruned.target}; removed ${pruned.removed.length} foreign-platform packages/binaries${pruned.removed.length ? `: ${pruned.removed.join(", ")}` : ""}`);

  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("/usr/bin/codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    "--timestamp=none",
    appPath,
  ], { stdio: "inherit" });
};
