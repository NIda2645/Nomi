# 投影铺开 · 模型面证据（2026-09-18）

> 状态：📎 交接/日志 · 2026-09-18 · 分支 `feat/tool-projection-rollout-20260918`

这一刀换的是模型面的**真相源**（19 个动词从手写 schema 改成宿主契约 schema 的投影）。换真相源的验收
只有一条：**模型看到的东西逐字节没变**。这个目录存的就是那把尺子的两端。

## 两端

| | 文件 | sha256 |
|---|---|---|
| before（`origin/main` = `2a35523aa` 的代码上采的） | `model-face-before.json` | `70a4c04633887cde44bd4ce9534851d467b3fad150fe124825794cf5070c3087` |
| after（本分支最终状态；它同时是门岗基线） | `../../../scripts/model-face-baseline.json` | `70a4c04633887cde44bd4ce9534851d467b3fad150fe124825794cf5070c3087` |

两个 sha256 相同 ⇒ `diff` 为空 ⇒ 20 个动词广播出去的 JSON Schema、描述、示例、提示词片段、效果与
时限，**一个字节都没变**。

**为什么 after 不另存一份**：它与 before 逐字节相同，再放一份 1877 行的同内容文件只会让评审多读两遍
同样的东西。after 那一端有一个更该存在的家——门岗基线 `scripts/model-face-baseline.json`：那份文件
不是「这次的留痕」，是**从今天起每次 CI 都去对的那一份**。

## 怎么自己重算

```bash
# 在任意 checkout 上重新采一份（不改任何东西）
pnpm exec tsx -e "import('./scripts/model-face-snapshot.mjs').then(async (m) => \
  process.stdout.write(m.serializeModelFace(await m.captureModelFace())))" > /tmp/face.json
shasum -a 256 /tmp/face.json
```

## 这把尺子从此常驻

`check:model-face-frozen`（`scripts/check-model-face-frozen.mjs`，在 `gates:contracts` 档上）。
它认三种变化：某个工具的任一面变了、工具多了/少了、以及**只换目录顺序**（顺序是合同——它是系统提示词
与 `tools/list` 的前缀，上游靠稳定前缀保住 KV-cache；逐工具比对看不见这一种，第一版真的漏报过）。
三条都有常驻阳性对照（`scripts/check-model-face-frozen.node-test.mjs`），其中第一条就是原型那次
**全绿**的变异：给宿主分支加一个必填字段，投影默认它是模型该填的
（`docs/plan/2026-09-18-tool-projection-cancel-job-prototype.md` 的「两次变异」那张表 ①）。
这道门存在的理由，就是让它从今天起红。
