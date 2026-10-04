# director/panels/topbar/
> L2 | 父级: ../CLAUDE.md
> 导演台唯一的常驻控件条（2026-09-09 五簇重排，方案 docs/plan/2026-09-09-director-chrome-five-clusters.md）。
> 在此之前控件分在四条带上：一整行标题栏 + 视口左缘创建栏 + 视口底中 8 簇胶囊 + 视口右下显示模式 —— 正是设计系统 §1.5.4 点名的反例。
> 收成五簇后刚好用满 L1「每个面 ≤5 个功能簇」的预算，视口四边只剩内容与情境浮层。簇的边界靠独立浮起的胶囊与间距，不用分隔线。
> 2026-10-04 用户拍板精修走方向 A「选中才出」：新顶栏 RefineTopBar 经 panels/refineLayoutPreview 的样张期接缝只在设计实验室出现；拍板后取代 DirectorTopBar（同 PR 删）。
> 成员清单
> shellChrome.tsx: 导演视图与精修共用的顶栏件：Cluster（功能簇胶囊，唯一定义）、ClusterDivider、ExitButton（← 退出，两面同图标同位置）、ViewModeSwitch（导演 | 精修）、HistoryButtons（撤销 / 重做，名字带快捷键）
> RefineTopBar.tsx: 精修「选中才出」顶栏：左 [← | ▤ 图层名 ▾] [选择 移动 旋转 缩放 | ＋]、中 [导演 | 精修]（开关开时）、右 [视图 ▾ | 撤销 重做 | 截图 产出]；网格模板 inline style，两侧列 minmax(max-content,1fr)：放得下时模式切换正好居中，放不下时让位、簇永不重叠
> SceneMenu.tsx: 「▤ 图层名 ▾」：浮层里是大纲（SceneObjectsTab 原样：搜索 / 图层 / 对象树）+ 底部「场景设置」；切图层只剩大纲图层行这一个家；图层名封顶 96px
> DirectorTopBar.tsx: 旧布局装配根（Cluster 已移到 shellChrome）：① 场景（图层名 + 切换下拉，只有一层时禁用并说明）｜② 视图（重置视角 + 视图 ▾）｜③ 工具（装配 viewport/ViewportToolbar）｜④ 添加与历史（＋添加 ▾ ｜ 撤销 / 重做）｜⑤ 交付（截图 / 产出弹层 / 退出）；三列网格 [1fr auto 1fr] 让工具簇真正落在视口正中（两端撑开只在左右两簇等宽时才居中），左右两簇 justify-self 贴边；壳把它绝对定位悬在分栏之上，顶偏移由 DirectorEditor 的窗口栏让位统一负责
> AddObjectMenu.tsx: 「＋ 添加 ▾」（传 onOpenAssets 时触发器只画 ＋、菜单底部多「资产库」）：角色（女 / 男 → 放置模式）、机位（选中主体时 14 预设、无主体只给「当前视角」，菜单头「相对主体：X」；预设机位直接叫预设名、新机位成为预览机位并取消主体选中）、灯光（3 种）、方块（画框模式）、导入 720 全景；两个创建模式经 CreationModeContext 拿，不自己调 hook
> topChrome.ts: DIRECTOR_TOP_CHROME_PX —— 顶栏在视口坐标里占掉的高度，布局契约单一真相；画中画默认位置 / 拖动下限、右栏顶部留白都从它 derive（顶栏是 absolute 浮层不占流，各写各的边距就会互相压住）
> ViewMenu.tsx: 「视图 ▾」（传 onResetView 时触发器是文字「视图 ▾」、首项「重置视角 0」）：几何体显示（实体 / 半透 / 白模）· 导出画幅 8 比例 + 自由 · 导出分辨率 3 档 · 三分线 / 骨骼与 IK 把手 / 角色头部标签三个视口开关 · 偏好设置与帮助入口；收的都是低频项（§1.5.3 收纳是最后一招）
> 法则: 成员完整·一行一文件·父级链接·技术词前置
> [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
