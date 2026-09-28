// 设计实验室 · 宿主接入配置走查（R13 人眼判断的素材源）。零额度：纯本地渲染，不碰任何生成 API。
//
// 流程住 `design-lab/walkScreen.mjs`（与另两屏共用一份）；这里只声明这一屏的取景参数。
// 产出：`tests/ux/shots/design-lab-host-config/<state>.png` + `_contact-sheet.png`（拍板用）。
//
// 用法：node tests/ux/design-lab-host-config.walk.mjs
import { walkDesignLabScreen } from './design-lab/walkScreen.mjs'

await walkDesignLabScreen({
  screen: 'host-config',
  title: '宿主接入配置',
  // 端口按 worktree + 角色派生（design-lab/labServer.mjs）：写死端口在这台常年 20+ worktree
  // 的机器上一定会撞，撞了截回来的是别人分支的 UI。
  role: 'walk-host-config',
  // 常驻设置卡，按实际内容取景。
  cellWidth: 720,
  columns: 2,
})
