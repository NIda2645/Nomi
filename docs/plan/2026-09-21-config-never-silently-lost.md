# 配置不许静默消失（批次 E · 主进程）

🚧 进行中 · 分支 `lane/salvage-mcp-onboarding-20260921`

- 规格正本：scratchpad `rootcause-config-loss-on-reinstall.md`（链路 file:line、同类横扫表、§6 最小修法）。
- 用户拍板：scratchpad `user-decisions.md` 末条（群友重装旧版后「所有模型配置丢了」）＋ 09-21 追加「配置导入导出也发版前做」。
- 根因合同：`docs/fixes/2026-09-21-config-never-silently-lost.root-cause.json`（schema v3，带门表）。

## 为什么（底层逻辑，用大白话）

一位 Windows 群友试了 0.21，再装回旧版，**所有模型配置都不见了**——他手配了一晚上的供应商、密钥、
映射，全空。他的建议是「多版本共存」「配置导入导出」。

查下来，他的配置**大概率一条都没丢**：新版把 `model-catalog.json` 升级到了旧版看不懂的版本号，
旧版读得出来、却在每一次读之前顺手做了一次**写**（内置种子对账），写被「不许降级覆盖」的保护拒绝、
抛出异常，异常一路传到设置页一个**裸 catch**，被吞成三个空列表。用户看到的是一个空白的、
**零报错**的模型设置页——于是「配置没了」。

真正会把文件抹掉的那条路在旁边，而且更狠：`readCatalog()` 只要读不出来（JSON 解析失败、
Windows 上被杀软/索引器锁住一瞬间），就立刻把**空目录原子写回**覆盖用户文件，没有任何备份。
**一次读失败 = 永久清空。**

结构性的病根：「这份配置读不出来的时候该怎么办」这个问题**没有主人**。它在十几个文件里各答各的
（`readJson(path, fallback)` 吞掉一切、`try { readJsonFile } catch { DEFAULT }` 复制了十三份），
而项目数据早就有「原子写 + 备份 + 从备份恢复」三件套。最难重建的资产反而一件防护都没有。

## 要权衡的那一件事

**「读不出来」时，是宁可让用户看到一个报错、还是宁可让 App 继续跑得顺？**
今天选的是后者（安静回落默认值），代价是用户的东西被安静盖掉。这次全部改成前者：
**宁可这一次不能改配置，也绝不覆盖一份我们没读懂的文件。**

## 先查别人

> 2026-09-21 合并 ① 补：这一节当时漏了，`check:prior-art` 把它拦了下来。下面每条都是现查的，带 file:line。

- **依赖里已有？** 没有可直接装的那一层。`electron/jsonFile.ts:29` 的注释点名了这一族的标准解法
  （graceful-fs / write-file-atomic 的短退避重试），但 `node_modules/write-file-atomic` **实查不存在**
  （本仓没装）——而且那类包解决的是「写得原子不原子」，不回答「读不出来怎么办」，正是本次的题。
- **仓库里已有？（原子写：有；留底：有，但只在项目侧）**
  - `electron/jsonFile.ts:53` `writeJsonFileAtomic`：临时文件 + fsync + rename，原子写这一半早就有，
    所以本次**没有重写它**，新原语层是包着它的（`configFileStore.ts` 直接调）。
  - `electron/workspace/workspaceManifest.ts:548`：**项目清单**读失败时会去读 `.bak` 那一份。
    同一套语义在项目侧已经跑了很久，配置侧一份都没有——这就是缺口本身，不是要发明的新东西。
  - `electron/workspace/workspaceManifestTransaction.ts:6`：事务化双写，但它绑 workspace root
    （`assertInsideWorkspace`），是「工程目录」的事务，不是通用的「配置文件」原语。
    **结论：复用它的语义（原子写 + 留底 + 损坏隔离），不复制它的实现**——理由是它的前提（workspace 租约）
    在 settings 根下不成立，照抄会把一条不适用的约束一起搬过来。
- **生态里已有？/ TikHub 上真实用户怎么解决？** **本轮没做这两问**，如实登记，不冒充查过。
  理由：这次要判的是「我们自己这份读通道为什么会把配置显示成空」，证据全在本仓三处代码里
  （根因调查 `rootcause-config-loss-on-reinstall.md` 已逐处核过），外部做法改变不了那三处的裁决。
  真要补，补的是「Electron 应用怎么做配置迁移与回滚」这一问，排在 Preview 分家那条之后。

## 做什么

| # | 动作 | 落点 |
|---|---|---|
| 1 | 读失败绝不覆盖：区分「不存在 / 读不了 / 读到了」；损坏的改名留底（`<名>.broken-<时间戳>.json`，字节不变），只是打不开的一个字节都不碰并拦下写 | `electron/configFileStore.ts`（新原语层）＋ catalog ＋ 全部 `settings/*` |
| 2 | 读通道上不许挂写：只读 IPC 摘掉 `ensureBuiltinModelSeeds()`；降级运行时只读 + 结构化状态 `catalogReadOnly` 供界面出横幅，不再抛错→界面置空 | `electron/main.ts`、`catalogStore.ts` |
| 3 | 写前 / 迁移前留底：每次写把上一版轮转成 `.bak`；跨版本迁移前留 `model-catalog.v<旧版本>.bak.json`（保留最近 3 份） | `configFileStore.ts` 一处，十几个配置文件受益 |
| 4 | 设置页裸 catch 改成保留上一份数据 + 把错误交给现有错误通道 | `src/ui/onboarding/useOnboardingDrawerCatalog.ts`（一处级接线） |
| 5 | Preview 与稳定版 userData 分家（今天共用，装一次 Preview 就能复现本次事故） | `electron-builder.preview.cjs`、启动处 `app.setName` |
| 6 | 棘轮门岗 `check:no-default-overwrite`：AST 扫「读失败/为空 → 写默认值回盘」 | `scripts/check-no-default-overwrite.mjs` |
| 8 | 配置导出/导入接上现成零件（默认不含 key、导入是合并不是覆盖、复用 `catalogPackageFormat.ts`） | `electron/catalog/catalogStore.ts` 现有 export/import |

## 不动项

catalog 的 schema 与版本号；`modelOnboarding/**`、`tests/parity`（同分支其他工人的成果）；
权限档相关设置项（主进程 lane 在做）；渲染层界面（横幅/按钮归渲染层 lane）。

## 回滚

每项一个独立 commit，互不依赖除第 3 项依赖第 1 项的原语。回退任意一项只需 revert 那个 commit；
原语层 `configFileStore.ts` 被全部配置读写引用，整条回退需连同各 store 的 import 一起 revert。

## 验收门

- 损坏的 catalog → 原文件改名保留、内容逐字节不变、**未写回**；
- 盘上版本更高 → 读成功、只读状态为真、文件逐字节不变、种子对账跳过且不抛；
- 迁移 → `.v<旧版本>.bak.json` 存在且字节等于迁移前；
- 导出包全文扫不到任何密钥材料；导入是合并、冲突默认保留现有并报清单；
- 新门岗先反向验红（把修法退回旧写法，门岗/测试必须当场红）。
