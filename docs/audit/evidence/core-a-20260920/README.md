# Core A 审计证据

> 说明：`semantic-audit.json`、`final-semantic-audit.json` 两份逐差异块账本（合计约 2.9 万行 / 3MB）与本目录全部截图**不随本分支进 main**，证据见 PR #828 分支。下文对它们的描述保留为审计事实记录。

`semantic-audit.json` 是 base `96d368c26` 至工作树 `30aaa144ea821efb0830997f9289798ec921de42` 的逐文件/逐差异块静态审查，覆盖 368 文件、790 hunks。每项保留原/现行为、理由、归属、证据和 blob/patch hash。`semantic-review.md` 是同一快照的可读报告。

这是历史静态判断，不是最后运行验收收据。随后 Electron 揭示 `core-a-composer.e2e.mjs` 新增“Create 必须卸载 DOM”的预期与原 keep-alive 契约冲突；**撤回该快照对该文件的 correct 判断**：新增测试还混淆锁定提示词与参数、依赖默认模式错误标签，且 blur 后先 mouseup 会掩盖取消失效。各项修复与复验另记，不反写历史账本。账本自身、之后文档/截图和源码增量不在该树内，必须另审。

文中 `patches/NNNN.patch` 是当时本地脚本输出的证据索引。只有本地历史对象或原 patch 仍在时，才能按 baseBlob/currentBlob 还原历史 dirty 差异；孤立 dirty blob 不保证随 PR 推送，未附历史字节的条目不能在远端独立复现。PR 当前实现须以实际 merge-base→head diff 和最终审查为准。原本地日志路径保留来源，不能当作远程可访问链接。最终系统结果、限制与截图以 [现行验收表](../../2026-09-20-core-a-current-acceptance.md) 为准；remaining-acceptance 和 T7 保留历史执行快照。

本轮同模型池审查没有冒充跨模型验收；中等模型调用不可用，机械清点由确定性脚本完成。

最终逐处复审记录在 `final-semantic-audit.json`：继承项要求 path/baseBlob/currentBlob/patchSha256 全同，变化项重新审；hunk ID 按最后清单重映射。该账本生成时唯一自排除文件是账本自身（避免递归 hash），其元数据/覆盖计数由主代理单独核验；其他交付文件均在清单内。静态 reviewed-no-open-findings 只表示这些差异没有未关闭静态发现，不代表剩余平台/系统场景已验。最终 PR commit 的文件 blob 应与该清单一致；账本记录的 dirty tree 是生成前源码快照，不冒称最终 commit。

`candidate-v17-receipt.json` 是实际 macOS 候选包旅程的有界摘要；`paid-v14-receipt.json` 是同一生产源码的既有真实供应商产物 verify-only 收据。两者测试入口不同，不互相替代。`validation-log-digests.json` 保存本地原日志 hash/字节数，便于本机核验，未附原日志，不能当远端可下载日志。
