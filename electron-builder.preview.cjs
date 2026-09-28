/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, module */

const sharedBuild = { ...require("./package.json").build };
delete sharedBuild.publish;

module.exports = {
  ...sharedBuild,
  appId: "com.nomi.app.preview",
  productName: "Nomi Preview",
  /**
   * **userData 分家**（批次 E，2026-09-21）。
   *
   * Electron 的 `app.getName()` 读的是 asar 内 package.json 的 `name`，`build.productName`
   * 不进 asar。所以在这一行之前，Preview 和稳定版共用同一个 `%APPDATA%\nomi`：appId 分开只让
   * 两者能**并存安装**，数据并没有分家——装一次 Preview 就足以把模型目录升到新版本号，
   * 回到稳定版就进「读得出来、改不了、设置页空白」的事故态
   * （scratchpad rootcause-config-loss-on-reinstall.md §4，用户 09-21 报的那次重装丢配置）。
   *
   * `extraMetadata` 是 electron-builder 自带的做法：它把这些字段写进打进 asar 的那份 package.json。
   * 运行时 `app.setName()` 不走这条路——那有 getPath 缓存与调用时机的坑（见
   * electron/capabilityCore/host.ts 顶部注释记的那次 headless 偶发）。
   *
   * 于是 Preview 得到 `<appData>/Nomi Preview` 与 `Documents/Nomi Preview Projects`，
   * 也就是 docs/release-process.md 一直在写、但直到今天才真正成立的那句话。
   * 首次启动会把稳定版那份配置**拷**一份过来（electron/settings/sideBySideInstallSeed.ts）：
   * 拷贝可以，共用不行。
   */
  extraMetadata: {
    name: "Nomi Preview",
  },
  directories: {
    ...sharedBuild.directories,
    output: "release-preview",
  },
  artifactName: "${productName}-${os}-${arch}.${ext}",
};
