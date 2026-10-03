// 付费卡「生成剩下 N 张」· **意图层**形态契约（2026-10-01 用户拍板样张；位置随后按用户反馈调整）。
//
// 正本是样张目录的 README（docs/design/mockups/2026-10-01-paid-card-generate-remaining/README.md）：
// 画板是改位置之前那一版，README 写的是拍板后的最终位置，这份契约按 README 机械化。
// 这里只写拍板那刻的人知道、机器扫不出的关系：
//   · 「生成剩下 N 张」在**动作行**里、而且排在最左——整叠的动作在左、这一张的动作在右，最贵的那颗离主按钮最远；
//   · 右边「去掉这张」和主按钮是一组（放不下一行时一起换行、不拆开）；
//   · 翻页那一行在动作行之上，翻页器住在那一行（报得出价时合计也在那一行，见 agent-spend-priced-card 走查）。
// 几何（中文一行、英文换行时左边那颗在上一行）在走查里按当时的语言量，不进这份契约——它随语言变。
// 走查：tests/ux/agent-spend-generate-remaining.walk.mjs（真 app，zh / en 各跑一遍）。

export default {
  mockup: 'docs/design/mockups/2026-10-01-paid-card-generate-remaining/index.html',
  mechanizes: {
    doc: 'docs/design/mockups/2026-10-01-paid-card-generate-remaining/README.md',
    sections: ['拍板：四处默认', '位置调整：翻页行只有翻页器（与合计）；「生成剩下」在动作行最左；右边两颗一组'],
    migratedAt: '2026-10-01',
  },
  surface: '付费卡（多镜）',
  layer: 'intent',

  structure: [
    { name: '「生成剩下 N 张」住在动作行里', ancestor: '[data-v4-block="actions"]', descendant: '[data-v4-control="batch"]' },
    { name: '整叠的动作在最左：排在「去掉这张」之前', before: '[data-v4-control="batch"]', after: '[data-v4-control="alternate"]' },
    { name: '「去掉这张」和主按钮是一组', ancestor: '[data-v4-block="card-actions"]', descendant: '[data-v4-control="alternate"]' },
    { name: '主按钮在那一组里', ancestor: '[data-v4-block="card-actions"]', descendant: '[data-v4-control="confirm"]' },
    { name: '翻页那一行在动作行之上', before: '[data-v4-block="pager-row"]', after: '[data-v4-block="actions"]' },
    { name: '翻页器住在翻页那一行', ancestor: '[data-v4-block="pager-row"]', descendant: '[data-v4-block="pager"]' },
  ],
}
