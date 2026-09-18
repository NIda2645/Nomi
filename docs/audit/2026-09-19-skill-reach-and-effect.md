# 技能送达与生效实测 · 2026-09-19

> 测量进行中；产品代码零改动。基线 `8d95b910305f724213c69224fa07b51fcc663cd1`，macOS arm64，本分支本地 build，1280×933。真 Electron、隔离空项目/设置/Chromium；凭据仅从本机 catalog 复制到隔离区，不进入证据。

## Q1 · 导入入口

**可见入口到达 2/3；首次冷启动点击数：技能库 6，composer 5。** 步数含“新建空白项目”“不分享”，不含动画跳过、文件选择；技能库实际多点一次“我的技能”，直接点导入可少一步。三个独立冷启动，未灌 store/走桥导航。截图均已人工查看。

| 路线 | 能到吗 / 步数 | 每一步看到的字与卡点 | 证据 |
|---|---|---|---|
| 技能库 | 是；6 点击（面板内 2 点击） | 新建空白项目 → 不分享 → 生成 → 技能 → 我的技能 → 导入文件；创作页没有技能库侧栏；空态明确写 SKILL.md / zip / 文件夹 | [项目页](../evidence/2026-09-19-skill-reach/shots/q1-02-project.png)、[生成](../evidence/2026-09-19-skill-reach/shots/q1-03-generation.png)、[技能库](../evidence/2026-09-19-skill-reach/shots/q1-04-skills.png)、[我的技能与导入](../evidence/2026-09-19-skill-reach/shots/q1-05-my-skills.png)；实际触发 filechooser |
| composer Skill | 是；5 点击（Skill 起 3 点击） | 新建空白项目 → 不分享 → Skill → 探索更多／新建·管理 → 导入文件；跳到生成区技能库，没有 composer 内直接导入按钮 | [菜单](../evidence/2026-09-19-skill-reach/shots/q1-b2-skill.png)、[跳转结果](../evidence/2026-09-19-skill-reach/shots/q1-b3-manage.png)、[逐步记录](../evidence/2026-09-19-skill-reach/q1-b.json) |
| 冷启动窗口直接拖 zip / .md | 浏览器级文件拖入 0/2；每次 1 次拖入。原生 Finder 拖入数字拿不到，因为当前执行工具没有操作系统文件拖拽接口 | 项目库不变、无提示、技能目录无新增。实际文件通过 CDP Input.dispatchDragEvent 交给 Chromium，**不是原生 Finder 手势，不能据此宣称原生路径已验** | [md](../evidence/2026-09-19-skill-reach/shots/q1-c2-md-drop.png)、[zip](../evidence/2026-09-19-skill-reach/shots/q1-c2-zip-drop.png)、[观察记录](../evidence/2026-09-19-skill-reach/q1-drop.json) |

## Q2 · 外部包

待测。来源已固定为 Anthropic、Trail of Bits、Hugging Face，共 5 个真实包，[来源/commit/散列/字段](../evidence/2026-09-19-skill-reach/external-packages.json)。未使用仓库格式夹具。

## Q3 · 模型自选

待测。[22 句题库与判据](../evidence/2026-09-19-skill-reach/q3-cases.json)已在调用模型前写入：应选 12、模糊 4、不应选 6；阳性对照另跑 S03 同句、仅删除索引中的目标条目。

## Q4 · 未测技能抽样

待测。

## 结构性发现

待逐层对账。

## 待拍板

等待测量结束汇总；本轮不修产品。

## 额度与验证

尚未发起真模型请求。验证与 PR 状态待交付时更新。
