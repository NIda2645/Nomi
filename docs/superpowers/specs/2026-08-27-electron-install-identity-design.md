# Electron 安装身份单一真相源设计

## 问题

仓库和锁文件声明 Electron `43.4.1`，但共享 `node_modules` 的 worktree 可以实际解析到另一条 worktree 中的 `31.7.7`。类型检查、开发启动和打包读取的是磁盘安装，不是 `package.json`，因此声明正确仍会反复使用旧版本。

同时 Electron 43 的包只提供 `install-electron`，依赖包自身没有 `postinstall`。一次普通 `pnpm install` 可能完成包链接，却没有下载 `dist` 运行时；现有流程只打印版本，未建立失败闸门。

## 目标不变量

每次开发、构建、门岗和发版使用 Electron 前必须同时满足：

1. worktree 顶层 `node_modules` 是自己的目录，不是软链接或 junction；
2. `package.json` 声明版本等于已安装 `electron/package.json` 版本；
3. `electron/dist/version` 等于声明版本；
4. 实际 Electron 可执行文件运行 `--version` 也等于声明版本。

任一不满足都立即失败，并给出一条可执行修复路径。不能继续拿旧版本跑出“全绿”。

## 方案比较

| 方案 | 用户看到什么 | 代价 | 结论 |
|---|---|---|---|
| 继续共享 `node_modules`，发现后手工重装 | 偶发类型错误、启动失败或发版版本漂移 | 每次都靠人记忆，问题会复发 | 否决 |
| 只在 CI 打印版本 | CI 日志能看到，但仍可能继续构建；本地完全不管 | 只观测，不阻断 | 否决 |
| 独立依赖 + 安装修复 + 四重身份闸门 | 错误在启动/构建前直接说明原因和修法 | 每条 worktree 多一次约数秒的链接安装 | 采用 |

## 设计

### 1. 可复用身份检查器

新增纯检查模块，读取顶层依赖目录形态、声明版本、包版本、`dist/version` 和真实可执行文件版本。检查器不修改磁盘，便于开发、CI、构建和测试共用。

### 2. 安装阶段补齐运行时

根 `postinstall` 在依赖链接完成后运行安装器：若包版本正确但 Electron 运行时缺失，执行 Electron 43 自带的 `install.js`；随后用同一检查器验证四重身份。软链接 `node_modules` 或错误包版本直接拒绝，不尝试覆盖别的 worktree。

### 3. 使用前 fail closed

`dev`、`start`、`build`、`dist` 和完整 `gates` 在使用 Electron 前调用同一检查。Windows 门岗由“打印版本”改为“验证版本”。

### 4. 工作流约束

开发文档明确禁止在 worktree 间链接或复用 `node_modules`，统一使用：

```bash
pnpm install --frozen-lockfile --prefer-offline
```

pnpm 内容仓库仍复用下载和包内容，只隔离每个 worktree 的解析关系。

## 非目标

- 不自动删除用户现有依赖目录；检查失败时只给安全修复命令。
- 不更改 Electron 版本。
- 不把机器路径或安装产物提交进 Git。

## 验收

- 软链接 `node_modules` 即使版本一致也拒绝；
- 声明 43 / 包 31、声明 43 / dist 31、声明 43 / 可执行 31 均拒绝；
- 缺少 `dist` 时安装阶段补齐，普通检查阶段拒绝；
- 四者均为 43.4.1 时通过；
- 完整 `pnpm run gates`、Windows workflow contract 和构建通过。
