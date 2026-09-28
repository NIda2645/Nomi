// AI 手艺产物节点（agent-artifact）· **意图层**形态契约（2026-09-07 接手返工时补）。
//
// 契约的边界：这里只写「机器扫不出、但拍板那刻的人知道」的关系——哪些位置承载设计意图。
// 挂点全不全、几何精确值、token 有没有漂，归自动层（同目录 `*.auto.mjs`，从样张导出）。
//
// 为什么这几条是意图而不是实现细节：原 PR 的实现把整个 n-head 漏掉了——卡上既没有类型角标
// 也没有标题（2026-09-07 走查截图为证）。漏掉之后功能全在、测试全绿、看起来"就是少了点东西"，
// 但它丢的是**身份**：画布上一张 Agent 手画的 SVG 线稿和一张模型生成的图长得一模一样，
// 用户分不出哪张能"固化为参考图"、哪张是成片。所以这三条不是装饰，是这个节点存在的前提。
//
// 被 tests/ux/agent-artifact.walk.mjs 引用并在真机上跑。
export default {
  mockup: 'docs/design/mockups/2026-09-06-agent-artifact-node.html',
  /**
   * 这份契约机械化的是哪一版拍板。这个面没有散文设计合同，拍板物就是样张本身，所以 `doc` 留空
   * （门岗缺省拿 `mockup` 当正本）。`migratedAt` 是契约上一次真的照着样张逐条誊过的日期——
   * 2026-09-07 接手返工时补的这份契约，样张最后变更在 2026-09-06，对得上。
   */
  mechanizes: { migratedAt: '2026-09-07' },
  surface: 'AI 手艺产物节点 · agent-artifact',
  layer: 'intent',

  structure: [
    // ── 样张 §「画布上的手艺产物」的 n-head：角标 + 标题，两个都长在头里。
    // 拆开放（比如标题挪到卡底、角标浮在内容上）就回到了「动作/信息压在内容上」那类老问题。
    {
      name: '类型角标必须长在产物卡头部里',
      ancestor: '[data-artifact-head]',
      descendant: '[data-artifact-kindchip]',
    },
    {
      name: '标题必须长在产物卡头部里',
      ancestor: '[data-artifact-head]',
      descendant: '[data-artifact-title]',
    },

    // ── 读的顺序就是认的顺序：先「这是什么做的」（SVG/HTML/表格/3D），再「它叫什么」。
    // 反过来的话，一屏产物扫下来先读到一串标题，还得回头找类型——认知多绕一圈。
    {
      name: '类型角标排在标题之前（先认类型，再认名字）',
      before: '[data-artifact-kindchip]',
      after: '[data-artifact-title]',
    },
    // ── 头部在内容之上：内容区是可滚动的产物本体，头部必须是**不动的**那条身份带。
    // 把头放进滚动区，滚两下身份就没了。
    {
      name: '头部排在内容之前（身份常驻，内容才滚）',
      before: '[data-artifact-head]',
      after: '[data-artifact-content]',
    },

    // ── §1.5：动作是 L2 情境层，选中才出，不常驻压在内容上。
    // 样张里浮条画在卡上方，且只画在「选中态」那张卡上——这条守的就是那个"只"。
    {
      name: '产物动作浮条默认不可见（选中才出现）',
      selector: '[data-node-floating-toolbar]',
      hiddenByDefault: true,
    },
  ],

  geometry: [
    // ── 内容是主角，头部是一条细带。头部一旦长胖，产物本身就被挤成缩略图——
    // 而这个节点存在的全部意义就是"把产物摆到创作现场看得见"。
    {
      name: '内容区必须比头部高（产物是主角，身份带只是一条）',
      selector: '[data-artifact-content]',
      largerThan: '[data-artifact-head]',
      dimension: 'height',
    },
    // ── 标题占满剩余宽度：产物名常常是「开场构图线稿」这种完整短句，
    // 角标是定宽小胶囊，剩下的宽度都该给标题，而不是留白。
    {
      name: '标题比类型角标宽（名字要读得全，角标只是个记号）',
      selector: '[data-artifact-title]',
      largerThan: '[data-artifact-kindchip]',
      dimension: 'width',
    },
  ],
}
