# M0：现有模型工具 descriptor 映射（50 行核账）

来源是 #223 ref `46066ed0` 的 `electron/harness/tools/*Descriptors.ts` 和 capability registry。目标语义工具来自根因总稿 §6.1：`project_context`、`document_read`、`document_edit`、`canvas_read`、`canvas_plan`、`canvas_edit`、`canvas_maintenance`、`media_query`、`timeline_read`、`timeline_edit`、`export_job`、`generation_plan`、`generation_status`、`production_run`、`skill_load`。

去向含义：`keep` = 作为语义工具本体保留；`merge` = 合并进目标语义工具；`host-only` = 仍是 canonical capability/Host transition，但不投影给模型；`delete` = 旧 model descriptor 在迁移提交中删除且无 fallback。编号 1–49 是当前 catalog 的可枚举 descriptor；第 50 行是 wire-level gate（不在 Pi catalog，但在 generation dispatcher/既有规格中出现），用于解释“50”口径差异。

| # | 当前 descriptor | 去向 | 目标语义工具 / 理由 |
|---:|---|---|---|
| 1 | `read_full_text` | merge | `document_read(scope=full)`；同一意图不暴露 scope 别名 |
| 2 | `read_selection` | merge | `document_read(scope=selection)`；保留严格 scope schema |
| 3 | `insert_at_cursor` | merge | `document_edit(operation=insert)`；统一 undo/approval |
| 4 | `replace_selection` | merge | `document_edit(operation=replace)`；消除编辑分支学习成本 |
| 5 | `append_to_end` | merge | `document_edit(operation=append)`；同一写入 owner |
| 6 | `author_skill` | host-only | Skill 写入不是普通创作工具；需 Host policy/用户确认 |
| 7 | `read_canvas_state` | keep | `canvas_read`；canonical 只读事实 |
| 8 | `propose_storyboard_plan` | merge | `canvas_plan`；计划产物，不直接写画布 |
| 9 | `arrange_storyboard_to_timeline` | merge | `canvas_plan` 的阶段分支；不作为单独选择器 |
| 10 | `create_staging_reference` | merge | `canvas_plan`；站位计划是同一用户意图 |
| 11 | `create_camera_move` | merge | `canvas_plan`；运镜计划同上，保留 custom fallback 语义在 schema 内 |
| 12 | `set_node_prompt` | merge | `canvas_edit(operations[])`；与 create/connect 同批、同一 proposal |
| 13 | `create_canvas_nodes` | merge | `canvas_edit(operations[])`；批量 typed operation |
| 14 | `connect_canvas_edges` | merge | `canvas_edit(operations[])`；批量 typed operation |
| 15 | `tidy_canvas` | merge | `canvas_maintenance`；布局维护与 delete 同一硬门 |
| 16 | `delete_canvas_nodes` | merge | `canvas_maintenance`；高风险、Host approval，不给裸 delete 分支 |
| 17 | `get_media` | merge | `media_query`；bounded read |
| 18 | `inspect_media` | merge | `media_query`；合并 search/inspect/range/waveform |
| 19 | `search_media` | merge | `media_query`；同一只读查询意图 |
| 20 | `inspect_source_range` | merge | `media_query`；范围是 query 参数，不是工具名 |
| 21 | `read_waveform` | merge | `media_query`；结果按 output contract 投影 |
| 22 | `inspect_export_job` | merge | `export_job(status/verify)`；只读分支合并 |
| 23 | `verify_render` | merge | `export_job(status/verify)`；同一 receipt 查询 |
| 24 | `export_timeline` | host-only | `export_job` 内部 effect；需 approval、revision、receipt |
| 25 | `cancel_export_job` | host-only | `export_job` 内部 transition；不可由模型绕过 Host |
| 26 | `read_timeline` | keep | `timeline_read`；完整事实读取 |
| 27 | `inspect_timeline_range` | merge | `timeline_read(range)`；参数化范围 |
| 28 | `propose_edit_plan` | merge | `timeline_edit(plan=preview)`；计划而非独立工具 |
| 29 | `apply_edit_plan` | merge | `timeline_edit(plan=apply)`；统一 proposal/undo |
| 30 | `undo_timeline_edit` | merge | `timeline_edit(plan=undo)`；同一可撤 EditPlan |
| 31 | `get_production_run` | merge | `production_run(read)`；统一 run/artifact 状态 |
| 32 | `subscribe_production_run` | host-only | 进度由 event stream 推送；模型不持有订阅生命周期 |
| 33 | `read_production_artifact` | merge | `production_run(read artifact ref)`；低频字段按需返回 |
| 34 | `read_production_artifact_content` | merge | `production_run(read artifact content)`；bounded JIT 读取 |
| 35 | `start_production_run` | merge | `production_run(create)`；保留 draft-only 语义，不直接生成 |
| 36 | `control_production_run` | merge | `production_run(control)`；pause/resume/cancel 统一 policy |
| 37 | `decide_production_gate` | host-only | 不能伪造真人批准；UI/Host event 消费 receipt |
| 38 | `revise_production_artifact` | merge | `production_run(artifact revise)`；版本化而不覆盖 |
| 39 | `review_production_artifact` | host-only | 审批属于用户 gate，不由模型决定 |
| 40 | `materialize_production_storyboard` | host-only | 已批准 artifact → Canvas 的 Host/UI command |
| 41 | `load_skill` | keep | `skill_load`；只读、hash/visibility 校验，不授予 capability |
| 42 | `nomi_get_generation_context` | merge | `generation_plan(context)`；模型/模式/参考素材上下文 |
| 43 | `nomi_operation_create` | keep | `generation_plan(create)`；唯一用户意图入口 |
| 44 | `nomi_submit_generation_plan` | merge | `generation_plan(patch)`；草稿修改不独立成工具 |
| 45 | `nomi_preview_execution` | merge | `generation_plan(preview)`；计划预览阶段 |
| 46 | `nomi_request_generation_gate` | host-only | 请求确认卡由 Host/UI 发起，模型只能提出 proposal |
| 47 | `nomi_start_generation` | host-only | 用户确认后的 Host event 才能启动付费 effect |
| 48 | `nomi_operation_read` | keep | `generation_status(read)`；计划/task/artifact 状态 |
| 49 | `nomi_cancel_generation` / `nomi_reconcile_generation` | merge | `generation_status(cancel/reconcile)`；未知结果只能核账 |
| 50 | `nomi_decide_generation_gate`（wire-level） | host-only | dispatcher/规格已有 receipt consumer，但 #223 Pi catalog 明确不投影；计数口径 OPEN QUESTION |

## 核账结论

按 `agentToolCatalog` 可枚举对象实数是 49（document 6 + canvas 10 + timeline 14 + production 9 + skill 1 + generation 9）。研究稿写“约 50”与 wire catalog 的第 50 行一致；在维护者裁决正文不可访问前，不把 `nomi_session_open` 或任何旧 alias 伪造为现有 descriptor。

