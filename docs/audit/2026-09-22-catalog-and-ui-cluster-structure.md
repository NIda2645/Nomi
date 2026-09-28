# 结构评审：`electron/catalog` 与 `src/ui` 的症状聚簇（2026-09-17 → 2026-09-22）

> 状态：📎 结构评审（`check:symptom-cluster` 触发：模块 `electron/catalog` 7 天内 11 份根因合同，模块 `src/ui` 同期 7 份）
> 触发合同：[`2026-09-22-credential-probe-paid-without-consent`](../fixes/2026-09-22-credential-probe-paid-without-consent.root-cause.json)（本 PR #845，T-MO-10）
> 姊妹评审（**不重写，交叉引用**）：[`2026-09-22-model-integration-layer-structure.md`](./2026-09-22-model-integration-layer-structure.md)（#847）、[`2026-09-22-src-ui-projection-cluster.md`](./2026-09-22-src-ui-projection-cluster.md)（#847）、[`2026-09-18-workbench-symptom-cluster-review.md`](./2026-09-18-workbench-symptom-cluster-review.md)、[`2026-09-21-capability-core-value-layer-structural-review.md`](./2026-09-21-capability-core-value-layer-structural-review.md)
> 范围：只看这两个模块键在本窗口内圈住的合同。不提新架构方案，**不在本 PR 动任何一刀**。

## 0. 为什么还要这一份——门岗已经绿了

合入 #847（`7e7f687bf`）之后 `check:symptom-cluster` 已经是绿的：它带来的
[`2026-09-22-model-integration-layer-structure.md`](./2026-09-22-model-integration-layer-structure.md)
正文里 `electron/catalog` 出现 5 次、`src/ui` 2 次，门岗按 `includes(cluster.module)` 判定，两簇都算「评审过了」。

**但那份评审覆盖的是「接模型」这一条切片**（连接身份派生、内置家字面量、自检终态、relay 迁移），
它自己也写清了范围。它没有、也不该诊断 `electron/catalog` 这 11 份的整簇（媒体契约、目录落盘与迁移、
凭据探测的费用边界），`src/ui` 那 7 份里它只覆盖到 6 份——第 7 份就是本 PR 这一刀，在他们那条 lane 上还不存在。

`symptom-cluster` 的注释把这件事说在前头了：**门岗只判「做没做」，做得好不好是人的事**（R17：
一道试图判质量的门岗会开始误判，然后被绕过）。所以这份文件不是为了让门岗变绿——它已经绿了——
而是为了让那个「绿」是真的。#847 的作者也明确建议过我们别只靠它过门。

## 1. 先纠正一个数：是 15 份，不是 17 份

门岗原文报的是 `electron/catalog` 11 份 + `src/ui` 6 份。合入 #847 之后 `src/ui` 变成 7 份
（它的 `2026-09-22-vendor-connection-identity` 的 `scope_paths` 含 `src/ui/onboarding/`）。
**11 + 7 = 18 条簇内成员，但只有 15 份不同的合同**——有 3 份同时落在两个簇里
（下表「两簇」列标 ●）。这份表列的是那 15 份。

复核方法（任何人都能重跑）：

```bash
node -e '
const fs=require("fs"),p=require("path");
import("./scripts/symptom-cluster-lib.mjs").then(({contractDate,modulesOf,findClusters})=>{
  const d="docs/fixes";
  const cs=fs.readdirSync(d).filter(n=>n.endsWith(".root-cause.json")).map(n=>{
    const f=`${d}/${n}`;
    return {file:f,date:contractDate(f),modules:modulesOf(JSON.parse(fs.readFileSync(p.join(d,n),"utf8")))};
  });
  for(const m of ["electron/catalog","src/ui"])
    for(const c of findClusters({contracts:cs}).filter(c=>c.module===m&&c.to>="2026-09-22"))
      console.log(m,c.from,"→",c.to,c.contracts.length,"\n ",c.contracts.map(e=>e.file).join("\n  "));
});'
```

| # | 日期 | 合同 | 两簇 | `class_root`（一句） | 子簇 |
|---|---|---|---|---|---|
| 1 | 09-17 | [`transcribe-leg-vendor-independence`](../fixes/2026-09-17-transcribe-leg-vendor-independence.root-cause.json) | | 转写腿没有自己的供应商，于是借用了文本脑的；没人声明过两种能力必须同家，也没有东西让这层借用可见 | **A** |
| 2 | 09-17 | [`credential-failure-preserved-clause`](../fixes/2026-09-17-credential-failure-preserved-clause.root-cause.json) | ● | 一句真假取决于状态的断言被存进了固定字符串，于是它落在唯一能求值它的那层够不着的地方 | **A** |
| 3 | 09-22 | [`credential-probe-paid-without-consent`](../fixes/2026-09-22-credential-probe-paid-without-consent.root-cause.json)（本刀） | ● | 一次出站调用花不花用户的钱，从来不是那次调用的声明属性；它住在某个种子旁边的注释里，而端点被两个价格不同的问题共用，于是便宜的那个静默继承了贵的那个的成本 | **A** |
| 4 | 09-18 | [`vendor-upsert-drops-fields`](../fixes/2026-09-18-vendor-upsert-drops-fields.root-cause.json) | ● | 写路径没有「记录必须完整」这条不变量的持有者：重建记录用的是白名单式**保留**而不是白名单式**覆写**，漏一个字段就是一次没人报错的数据丢失 | **B** |
| 5 | 09-18 | [`flagship-image-profiles-missing`](../fixes/2026-09-18-flagship-image-profiles-missing.root-cause.json) | | 档案是手写数据，而「供应商上新了一个用户会为之充值的旗舰模型」在仓库里没有任何东西会红——唯一的检测器是人手跑的 `radar:models` | **B** |
| 6 | 09-17 | [`presigned-put-drops-signed-headers`](../fixes/2026-09-17-presigned-put-drops-signed-headers.root-cause.json) | | 「带哪些头、前缀写什么词」是供应商在响应或契约里告诉我们的事实，两处却把它常量化了 | C（#847） |
| 7 | 09-18 | [`credential-destination-is-user-confirmed`](../fixes/2026-09-18-credential-destination-is-user-confirmed.root-cause.json) | | 同源判据只在「收到说明卡」那一刻查过一次，看不见旧数据、手改的 json 和后加的写入口 | C（#847） |
| 8 | 09-22 | [`vendor-connection-identity`](../fixes/2026-09-22-vendor-connection-identity.root-cause.json)（#847） | ● | 连接身份被建模成「我在跟哪台服务器说话」而不是「我在那台服务器上持有哪个身份」；而域名派生的 key 同时又是全系统主键，于是十六处学会了拿它比字面量 | C（#847） |
| 9 | 09-17 | [`background-run-project-identity`](../fixes/2026-09-17-background-run-project-identity.root-cause.json) | | run 的项目身份从来不是 run 的属性：每一步都现问「现在开着哪个项目」，于是身份随 UI 导航漂移 | D |
| 10 | 09-17 | [`interactive-import-project-context`](../fixes/2026-09-17-interactive-import-project-context.root-cause.json) | | 项目 IO 权限谁想起来谁自取（或 await 之后晚兜底），而不是在动作入口由 window + 项目身份的主人签发一次 | D |
| 11 | 09-17 | [`local-speech-provider`](../fixes/2026-09-17-local-speech-provider.root-cause.json) | | 「按需下载的第三方可执行物与权重」需要一层共用地基（钉版本、逐文件 sha256、原子落盘、进度、失败分类）；它此前只以「深度权重专用」形态存在，第二家要用只能复制 | E |
| 12 | 09-18 | [`ownership-single-source`](../fixes/2026-09-18-ownership-single-source.root-cause.json) | | 本仓的合同带「这是什么」但不带「谁拥有它」；没有 owner 轴，谁需要谁就抄一份，每份写下的当天都对、owner 变的当天全错 | E |
| 13 | 09-21 | [`model-spec-parity`](../fixes/2026-09-21-model-spec-parity.root-cause.json) | | 「这个模型收哪些参数、认哪个身份」没有单一 owner，而唯一还能拦住错值的那层被造成了丢弃它而不是拒绝它 | E |
| 14 | 09-17 | [`mcp-launcher-ownership`](../fixes/2026-09-17-mcp-launcher-ownership.root-cause.json) | | 自动配置修复没有「坏掉的资源」与「另一个可用的主人」之间的共享区分 | E |
| 15 | 09-17 | [`project-artifact-storage-and-projection`](../fixes/2026-09-17-project-artifact-storage-and-projection.root-cause.json) | | 存储、放置与传输投影三种职责被混在一起，而不是各自保住显式的类型、身份与几何不变量 | E |

15 份的 `class_root` 都读到了原文，没有「未读透」的。

## 2. 模块键太粗：11 份里只有 6 份真的是这一层

用每份合同自己声明的 `invariant_owner_layer`（机器取值，不是印象）判「它到底该修在哪一层」：

```bash
for f in docs/fixes/2026-09-1[78]-*.root-cause.json docs/fixes/2026-09-2[12]-*.root-cause.json; do
  node -e "const c=require('./$f');const o=c.invariant_owner_layer;console.log('$f',(o&&(o.layer||o.path))||'(无声明)')"
done
```

| 合同 | 不变量 owner | owner 在 `electron/catalog`？ |
|---|---|---|
| transcribe-leg-vendor-independence | `electron/catalog/executableModel.ts` | **是** |
| credential-failure-preserved-clause | `electron/catalog/validateCandidateCredential.ts` | **是** |
| credential-probe-paid-without-consent（本刀） | `electron/catalog/credentialProbePolicy.ts` | **是** |
| vendor-upsert-drops-fields | `electron/catalog/upsertDraft.ts` | **是** |
| flagship-image-profiles-missing | `electron/catalog/seedBuiltins.ts` | **是** |
| presigned-put-drops-signed-headers | `electron/catalog/assetLocalization.ts` | **是** |
| credential-destination-is-user-confirmed | `electron/vendor/vendorOutboundGuard.ts` | 否 |
| background-run-project-identity | `src/workbench/generationCanvas/runner/runProjectDelivery.ts` | 否 |
| local-speech-provider | `electron/downloads/verifiedAssetCache.ts` | 否 |
| ownership-single-source | `electron/shared/surfacePortBinding.ts` | 否 |
| model-spec-parity | `electron/capabilityCore/executionContract.ts` | 否 |

**6 / 11。**另外 5 份进簇，是因为 `scope_paths` 里**顺带**碰到了 `electron/catalog/`：
`model-spec-parity` 26 条 scope 里 5 条、`ownership-single-source` 12 条里 2 条、
`background-run-project-identity` 22 条里 1 条（`customCallDispatch.ts`）。

`src/ui` 那一簇更极端：**7 / 7 的 owner 都在 `src/ui` 之外**（5 份在 `electron/`，2 份在 `src/workbench/`）。
#847 的 [`src-ui-projection-cluster.md`](./2026-09-22-src-ui-projection-cluster.md) 已经把这一条查过、
并给出了同样的裁决——**不对 `src/ui` 做结构重构，对着投影层重构治的是症状**。本评审复核了它的取值，
逐行一致，并补上它当时看不到的第 7 份（本刀，owner `electron/catalog/credentialProbePolicy.ts`，同样在 `src/ui` 之外）。

这已经是第三次得到同一个结论（[`.github/workflows` 那次](./2026-09-22-quality-gate-workflow-structure.md)、
[#847 那次](./2026-09-22-model-integration-layer-structure.md)、这次）。**不建议去让门岗变聪明**——理由见 §5。

## 3. 真正同层的子簇

### 子簇 A ·「没有声明位的属性，会安静地继承邻居的值」（3 份，owner 全在 `electron/catalog`）

把三份并排读，用词差得很远，形状是同一个：

| 合同 | 哪个属性没有声明位 | 它继承了谁的值 | 用户看到什么 |
|---|---|---|---|
| 09-17 transcribe-leg-vendor-independence | 「转写这条腿用哪家供应商」 | 文本脑的供应商 | 明明在别家开着转写模型，拆解却说「没有可用的转写模型」 |
| 09-22 credential-probe-paid-without-consent（本刀） | 「验这把 key 这一下花不花钱」 | 每周雷达 `livenessProbe` 的价格（按定义是真实生成） | 点「保存验证」当场扣费，报价卡永远不出现 |
| 09-17 credential-failure-preserved-clause | 「上一把 key 和连接还在不在」 | 那条固定文案串的「永远为真」 | 第一次接入就失败时，被告知「原有的 key 未受影响」——而根本没有原有的 key |

**共同的那句话：一个属性没有属于自己的声明位时，它不会报错说「我不知道」，它会采用手边最近那个邻居的值。**
三份的可观测特征一模一样——**不报错**。这正是它们能在一周里攒到三份的原因：
形状错会当场红，「继承来的值」只会安静地做出一个不对的结果。

本 PR 立的 `electron/catalog/credentialProbePolicy.ts` 正是给第二行补上那个声明位，
并且把缺省定成 fail-closed（种子不声明 `cost` 就判 `paid` = 先问），理由写在文件头：
T-MO-20 真实烧掉过 $0.439，「我以为它免费」必须写成「有出处地声明它免费」才算数。

这一簇还欠一扇门：**T-MO-27 / `onboardingIpc.probeOneProtocol`**——自定义中转的「测试连接」/
协议自动探测今天仍然静默发一次真实 `POST /chat/completions`。它没随本刀一起改是有理由的
（协议判别这个问题模型列表答不了；而在发版前阻断 lane 里给每次「测试连接」加确认卡，
那张卡在渲染层不可达时 fail-closed，会把自定义供应商向导变成死路）。本刀的合同把它
如实记在 `same_class_entry_points` 里标为 deferred，没有藏。

**下一刀**：先探 `GET /models`，只对真需要协议判别的那一步问一次，并把这条路接进 `credentialProbePlan` ——
让「花不花钱」在全仓只有一个答话人。（**不在本 PR 做**；本批只在按钮旁加一行如实提示。）

### 子簇 B ·「目录数据的完整性与新鲜度，没有任何机器在核」（2 份，owner 全在 `electron/catalog`）

| 合同 | 缺的是哪一半 | 唯一的检测器是什么 |
|---|---|---|
| 09-18 vendor-upsert-drops-fields | **完整性**：写回时按白名单保留，新加的字段忘了同步就静默丢 | 无。类型系统看不见（多余/缺失的键都合法），门岗没有，测试不碰 |
| 09-18 flagship-image-profiles-missing | **新鲜度**：供应商上新了旗舰模型，档案没种 | `pnpm run radar:models`——**人手跑的雷达，不是门岗** |

两份是同一句话的两个方向：**`electron/catalog` 里有一大片手写的声明数据
（种子、档案、wire defaults、字段白名单），它的正确性今天靠「写的人记得」，而漏掉时不报错。**
这一层跟子簇 A 是亲戚但不是同一个：A 缺的是**声明位**（属性无处安放），B 缺的是**核对者**（声明位有，但没人查它齐不齐、新不新）。

**下一刀**：把「白名单式覆写」这条不变量做成门岗而不是约定——对 `Vendor`/`Model`/`Mapping`
的每个字段要求一条显式裁决，新增字段没裁决就红；新鲜度那一半则把 `radar:models`
的差集变成一条 advisory check，让「协议能到、档案没种」这一格在 CI 里可见。（**不在本 PR 做**。）

## 4. 交叉引用：这三簇已经有人诊断过，本评审不重写

| 子簇 | 合同 | 去哪份评审读 |
|---|---|---|
| **C ·「接模型」切片**（3 份） | presigned-put-drops-signed-headers、credential-destination-is-user-confirmed、vendor-connection-identity | [`2026-09-22-model-integration-layer-structure.md`](./2026-09-22-model-integration-layer-structure.md)（#847）。它的 §2.2 把这三份归进「一句用户能听懂的话，代码里没有唯一的人负责回答」，并逐条数了门。**它的 §2.3 还顺手否掉了一个关于本 PR 的错误直觉**——「凭据探测有四份各自的策略」不成立，真正没主人的是「验这一下花不花钱」，也就是本评审的子簇 A。 |
| **D ·「项目身份该在入口签发一次」**（2 份） | background-run-project-identity、interactive-import-project-context | [`2026-09-18-workbench-symptom-cluster-review.md`](./2026-09-18-workbench-symptom-cluster-review.md) 的 A 类已逐份列出。两份的 owner 都在 `src/workbench/`——这一簇是被两个粗模块键各分走一半的，单看 `electron/catalog` 或单看 `src/ui` 都看不见它。 |
| **E · 只是顺带碰到目录/UI 的**（5 份） | local-speech-provider、ownership-single-source、model-spec-parity、mcp-launcher-ownership、project-artifact-storage-and-projection | 各自已有评审：[capability-core 值层](./2026-09-21-capability-core-value-layer-structural-review.md)（model-spec-parity，列在它的表里）、[src-ui 投影簇](./2026-09-22-src-ui-projection-cluster.md)（local-speech-provider、mcp-launcher-ownership、project-artifact-storage-and-projection）、[preset-library 投影](./2026-09-20-preset-library-projection.md)（ownership-single-source）。 |

## 5. 不做什么，为什么

- **不在本 PR 动任何一刀。**本 PR（T-MO-10）只做「验这一下花不花钱」这一件事。子簇 A 的第四扇门、
  子簇 B 的两道门岗，都写成了下一刀，不夹带。
- **不让 `symptom-cluster` 的模块键变聪明。**这已经是第三份评审记下同一个误报形状了，很诱人去修。
  但 `symptom-cluster-lib.mjs` 的注释已经把代价写在前头：门岗只判**做没做**，
  一道试图判质量的门岗会开始误判，然后被绕过（R17）。**多读一份本文档，比让门岗学会分辨「顺带改到」便宜得多。**
- **不去统一凭据探测的四个文件。**#847 的 §2.3 已经实核过：探测本体一份（`ai/onboarding/modelListProbe.ts`），
  `directKeyCredential.ts` 的分叉是**有据的刻意选择**（apimart 对 `/v1/models` 回 401，
  拿可达性当有效性会造假阴性）。为了让文件数变少去合并它，会把那个假阴性重新引回来。
- **不对 `src/ui` 做结构重构。**理由是 §2 的 7/7，与 #847 的裁决一致。

## 6. 覆盖边界（本评审到此为止）

- **本评审真正诊断的是 5 份**：子簇 A 的 3 份 + 子簇 B 的 2 份。它们的共同点是 `invariant_owner_layer`
  都在 `electron/catalog`，且在本窗口之前没有任何一份 `docs/audit/*` 从 catalog 这一侧诊断过它们
  （`credential-probe-paid-without-consent`、`transcribe-leg-vendor-independence`、`flagship-image-profiles-missing`
  三份此前在 `docs/audit/` 下零命中）。
- **其余 10 份点名归类但不重复诊断**，各自去处见 §4 的表：C 簇 3 份见 #847 的接模型评审，
  D 簇 2 份见 09-18 workbench 评审，E 簇 5 份见各自评审。
- **本评审不覆盖**：这两个模块键在 2026-09-17 之前的历史窗口（`electron/catalog` 在 08-28→09-03
  那个窗口有 40 份，属阈值前不追溯的范围）；也不覆盖 `electron/providerAdapter`、
  `electron/integrationCertification`、`src/config`、`src/i18n` 这几个同期被报的模块——前两个见 #847 的接模型评审，
  后两个见 #847 的 src-ui 投影评审。
