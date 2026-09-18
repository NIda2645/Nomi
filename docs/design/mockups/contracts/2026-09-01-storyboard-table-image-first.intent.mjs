// 分镜表 · **意图层**形态契约（拍板方手写，2026-09-03 建；2026-09-18 迁到 v6）。
//
// ⚠️ 文件名跟着 v5 样张走（门岗 `check:mockup-contracts` 按样张名找契约），但**条款已迁到 v6**：
// 机制的正本是 `mechanizes` 里那份获批设计合同，不是同名的 v5 样张 HTML。
// v6（信息架构重做，0d5a56d47）有意推翻了 v5 的两条，见下方逐条注释；v5 其余条款原样保留。
// 本次迁移只誊抄 v6 合同**自己写下的数字**，一个都没有新编；合同里已被后续反馈作废的数字
// （§4.1 修订把参考列「200px」作废、改成从盒子 derive）**不写进契约**。
//
// 契约的边界：这里只写「机器扫不出、但拍板那刻的人知道」的关系——哪些位置承载设计意图。
// 挂点全不全、几何精确值、token 有没有漂，归**自动层**（同目录 `*.auto.mjs`，从样张导出）。
// 两层共用 `tests/ux/_assert.mjs` 的 `assertMockupContract` 与门岗 `check:mockup-contracts`。
//
// 每条规则都对应一次真实的拍板决定，注释写清「为什么这条是意图而不是实现细节」——
// 没有理由的规则会随时间腐烂成教条，下一个人不敢删也不敢改。
//
// ⚠️ 本文件当前覆盖 main 上已落地的 A/B 段形态。**C 段（结构化提示词）落地时必须补两条**，
// 它们正是催生整套机制的那次偏离（样张里骨架段是提示词文本内的虚线段，实现做成了框下一行胶囊）：
//   { name: '骨架段必须长在提示词框内部', ancestor: '[data-storyboard-prompt-block]',
//     descendant: '[data-storyboard-prompt-segment]' }
//   { name: '@ 引用胶囊必须长在提示词框内部', ancestor: '[data-storyboard-prompt-block]',
//     descendant: '[data-storyboard-mention-chip]' }
// 这两条已写进 C 段打回单，收货时逐条验。

export default {
  mockup: 'docs/design/mockups/2026-09-01-storyboard-table-image-first.html',
  /** 这份契约机械化的是哪一份获批设计合同——换了信息架构却没换这一行，就是契约过期了。 */
  mechanizes: {
    doc: 'docs/design/2026-09-05-storyboard-table-v6-design-contract.md',
    sections: ['§2.3 行骨架', '§2.4 画面格比例规则', '§4.1 修订（2026-09-06 用户反馈四）'],
    migratedAt: '2026-09-18',
  },
  surface: '分镜表 v6 · 分镜行',
  layer: 'intent',

  structure: [
    { name: '骨架段必须长在提示词框内部', ancestor: '[data-storyboard-prompt-block]', descendant: '[data-storyboard-prompt-segment]' },
    { name: '@ 引用胶囊必须长在提示词框内部', ancestor: '[data-storyboard-prompt-block]', descendant: '[data-storyboard-mention-chip]' },

    // ── 行三块顺序：要生成的 → 拿来参考的 → 怎么描述。用户 2026-09-01 亲自指定的阅读顺序。
    {
      name: '画面格排在参考区之前',
      before: '[data-storyboard-frame]',
      after: '[data-storyboard-refzone]',
    },
    {
      name: '参考区排在提示词块之前',
      before: '[data-storyboard-refzone]',
      after: '[data-storyboard-prompt-block]',
    },

    // ── 上下位置本身在教顺序：先把「谁/哪儿」定下来，再一镜一镜拍。不用写一个字的说明。
    {
      name: '参考卡区排在分镜表之前（版面即教学顺序）',
      before: '[data-storyboard-anchors]',
      after: '[data-storyboard-rows]',
    },
    // 「全部镜头」批量条（样张 A 拍板 2026-08-17）改的是整片，必须排在逐行表格之前——
    // §1.6 C3：不同作用域的控件必须视觉可分，位置是最强的那道分隔。
    // 注意别错认底栏的 [data-storyboard-batch]（那是「生成未生成的 N 镜」按钮，本就在表之后）。
    {
      name: '整片作用域的批量条排在逐行表格之前',
      before: '[data-storyboard-bulkbar]',
      after: '[data-storyboard-rows]',
    },

    // ── v6 §2.3 推翻了 v5 的「悬停才出现」：动作条**移到画面格下方、一行常驻小图标**，
    // 理由写在合同里——半透明按钮压在缩略图上本来就是 §1.5.3 的已知反例，不是 v6 引入的新债。
    // 所以这条从「默认不可见」翻成「排在画面格之后」：常驻可以，压图不行。
    {
      name: '动作条排在画面格之后（v6：移到格子下方，不压图）',
      before: '[data-storyboard-frame]',
      after: '[data-storyboard-actbar]',
    },
    // v6 §2.3：「分镜行只有四块……行尾没有展开按钮，也没有展开区」。展开态连同台词/转场字段
    // 已整体删除，这条从「默认收起」变成「不许再长回来」的看门狗（元素不存在即满足）。
    {
      name: '行展开区不存在（v6 删掉了行展开态，台词/转场归剪辑面）',
      selector: '[data-storyboard-expand]',
      hiddenByDefault: true,
    },
  ],

  geometry: [
    // ── 「图是主角」：用户 2026-09-02 定的最高原则。画面格必须是行内视觉重心，
    // 不能退化成邮票——一旦小到认不出人脸，整张表就失去「扫一列看全片」的价值。
    // v6 §2.3 把行 grid 定成 `14px 136px 200px minmax(0,1fr)`：画面格**列宽固定 136px**
    // （列宽固定，批量竖向扫视时左边缘永远对齐）。v5 的「76px」量的是格子本身，
    // v6 把「列」和「格子里的媒体框」拆成两个几何概念，下面两条分别断言。
    {
      name: '画面格列宽固定 136px（v6 §2.3 行 grid）',
      selector: '[data-storyboard-frame]',
      dimension: 'width',
      expected: 136,
    },
    // v6 §2.4：媒体框按画幅在这只固定列里缩放，「三种拍板画幅的落点：9:16 → 76×135、
    // 16:9 → 136×77、1:1 → 108×108，与样张逐像素一致」。竖版那一档正是 v5「图是主角」
    // 那条意图的 v6 写法——76 宽这个数一路没变，变的是它现在住在 136 的列里。
    {
      name: '9:16 媒体框 76×135（v6 §2.4 的竖版落点）· 宽',
      selector: '[data-storyboard-frame-media="9:16"]',
      dimension: 'width',
      expected: 76,
    },
    {
      name: '9:16 媒体框 76×135（v6 §2.4 的竖版落点）· 高',
      selector: '[data-storyboard-frame-media="9:16"]',
      dimension: 'height',
      expected: 135,
    },
    {
      name: '画面格必须比参考区宽（图是主角，参考是配料）',
      selector: '[data-storyboard-frame]',
      largerThan: '[data-storyboard-ref-tile]',
      dimension: 'width',
    },

    // ── 参考 tile 56px 是用户 2026-09-02 亲自从 40px 提上来的：
    // 「40px 连这是谁都认不出」。认人靠 56px，判断靠悬停浮层，细看靠全屏——三层分工的第一层。
    {
      name: '参考 tile 约 56px（认得出是谁的下限）',
      selector: '[data-storyboard-ref-tile]',
      dimension: 'width',
      expected: 56,
    },
    // v6 §4.1 修订（2026-09-06 用户反馈四）：槽用**一只固定盒**（65×73 的扇面包围盒），
    // 「三个槽、叠放堆、单张 tile、缺输入图的红虚框全部同宽同高、同一条顶线」。
    // 注意：同一条修订把参考列的「200px」作废、改成从盒子 derive（211），所以**列宽不写进契约**
    // ——合同原话「列宽是结果不是常数」，把结果钉成字面量就是把那条决定又推翻一次。
    {
      name: '参考槽固定盒宽 65px（v6 §4.1：同宽同高、同一条顶线）',
      selector: '[data-storyboard-ref-slot]',
      dimension: 'width',
      expected: 65,
    },

    // ── 提示词块是主输入面，不是行里的一个格子。用户原话：
    // 「提示词就那一窄条，他怎么输入呢？」——这条防止它再被压回条状。
    {
      name: '提示词块必须比参考区宽（它是主输入面，不是一个格子）',
      selector: '[data-storyboard-prompt-block]',
      largerThan: '[data-storyboard-refzone]',
      dimension: 'width',
    },
    {
      name: '提示词块高度不低于画面格（占满行高，不是压在行底的一条）',
      selector: '[data-storyboard-prompt-block]',
      dimension: 'height',
      expected: 132,
    },
  ],
}
