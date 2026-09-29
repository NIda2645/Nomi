const fs = require("node:fs");
const path = require("node:path");
const {
  binaryFormat, isForeignBinary, mayBeNativeBinary, normalizeArch, normalizePlatform, packageSupportsTarget, readHead,
} = require("./native-binaries.cjs");

// ffmpeg / ffprobe 各平台子包的名字。只给 audit-packaged-media.cjs 做「目标包必须恰好一个」的正向检查用；
// 裁剪不再按这张表删（见下面 prunePlatformBinaries 的说明）。
const PLATFORM_PACKAGES = Object.freeze({
  ffmpeg: Object.freeze([
    "darwin-arm64", "darwin-x64", "linux-arm", "linux-arm64",
    "linux-ia32", "linux-x64", "win32-ia32", "win32-x64",
  ]),
  ffprobe: Object.freeze([
    "darwin-arm64", "darwin-x64", "linux-arm", "linux-arm64",
    "linux-ia32", "linux-x64", "win32-ia32", "win32-x64",
  ]),
});

function targetPackageName(electronPlatformName, arch) {
  const target = `${normalizePlatform(electronPlatformName)}-${normalizeArch(arch)}`;
  for (const names of Object.values(PLATFORM_PACKAGES)) {
    if (names.includes(target)) return target;
  }
  throw new Error(`Unsupported packaged media target: ${electronPlatformName}/${String(arch)}`);
}

/** unpacked 的 node_modules 下所有「带 package.json 的包目录」（含 @scope/x 与嵌套 node_modules）。 */
function listPackageDirs(nodeModulesPath) {
  const result = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const child = path.join(dir, entry.name);
      if (entry.name.startsWith("@")) {
        visit(child);
        continue;
      }
      if (fs.existsSync(path.join(child, "package.json"))) result.push(child);
      const nested = path.join(child, "node_modules");
      if (fs.existsSync(nested)) visit(nested);
    }
  };
  visit(nodeModulesPath);
  return result;
}

function listFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

/**
 * afterPack：把 app.asar.unpacked/node_modules 里目标平台跑不起来的东西删掉。
 *
 * 两类，判据都在 native-binaries.cjs（审计脚本判红用的是同一份）：
 *   ① 整包：package.json 声明了 os/cpu 且不含目标（@ffmpeg-installer/<别的平台>、
 *      CI 上 `pnpm install --force` 装进来的各平台原生子包）；
 *   ② 单个文件：多平台包里夹带的别的平台二进制，按文件头判（sandbox-runtime 的 vendor/seccomp
 *      是 Linux ELF、srt-win/arm64，pi-tui 的 darwin/win32-arm64 prebuilds）。
 * 以前这里只认 ffmpeg/ffprobe 两家的平台子包名（2026-08-07 那次 560MB）；0.22.4 的包里又冒出六个
 * 别家的外平台二进制——按名字列举永远追不上新依赖，按「能不能跑」判才关得住这一族。
 */
function prunePlatformBinaries(unpackedNodeModulesPath, electronPlatformName, arch) {
  const target = targetPackageName(electronPlatformName, arch);
  const platform = normalizePlatform(electronPlatformName);
  const removed = [];
  if (!fs.existsSync(unpackedNodeModulesPath)) return { target, removed };
  const relative = (full) => path.relative(unpackedNodeModulesPath, full).split(path.sep).join("/");
  for (const packageDir of listPackageDirs(unpackedNodeModulesPath)) {
    if (!fs.existsSync(packageDir)) continue;
    const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
    if (packageSupportsTarget(manifest, platform, arch)) continue;
    fs.rmSync(packageDir, { recursive: true, force: true });
    removed.push(relative(packageDir));
  }
  for (const file of listFiles(unpackedNodeModulesPath)) {
    if (!mayBeNativeBinary(relative(file)) || fs.statSync(file).size < 8) continue;
    if (!isForeignBinary(binaryFormat(readHead(file)), platform, arch)) continue;
    fs.rmSync(file, { force: true });
    removed.push(relative(file));
  }
  return { target, removed };
}

module.exports = { PLATFORM_PACKAGES, normalizeArch, targetPackageName, prunePlatformBinaries };
