// 设计实验室 · 导演视图（3D-BOX）屏的轻量常量与类型——labScreens 与状态注册表只 import 这里，
// 不碰导演台的模块图（重的那份在 director3dboxLabKit.tsx，只经 director3dboxLazyStage 动态加载）。

/** 取景框 = 真机走查窗口的内容区（ACCEPTANCE_VIEWPORT 1280×933），实验室格子与真机截图同尺寸才能并排比。 */
export const DIRECTOR_3DBOX_CELL_WIDTH = 1280
export const DIRECTOR_3DBOX_CELL_HEIGHT = 933

/** 工程夹具：空工程，或 courtyard-standoff 计划经现役编译器编出的庭院对峙。 */
export type Director3dBoxFixture = 'empty' | 'courtyard'
/** 格子要替用户点的真按钮：不点 / 点第 2 张镜头卡 / 点完再切「精修」。 */
export type LabDrive = 'none' | 'shot-2' | 'shot-2-refine'
