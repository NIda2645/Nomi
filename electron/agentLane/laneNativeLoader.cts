import type { MigrateLaneLegacy } from '../shared/agentLane/laneLegacyMigrationContract';
import type { OpenDesktopLaneWorkspace, RunLaneSingleShot } from './laneRuntimePort';
import type { TrajectoryTurnInput } from '../shared/agentLane/laneTrajectory';

/** Native import survives CommonJS compilation; pi never enters preload or renderer. */
export const openDesktopLaneWorkspace: OpenDesktopLaneWorkspace = async (options) => {
  const { openLaneWorkspace } = await import('./laneWorkspace.mjs');
  return openLaneWorkspace(options);
}

export const runLaneSingleShot: RunLaneSingleShot = async (options) =>
  (await import('./laneSingleShot.mjs')).runLaneSingleShot(options);

export const migrateLaneLegacy: MigrateLaneLegacy = async (options) =>
  (await import('./laneLegacyMigration.mjs')).migrateLaneLegacy(options);

export const openLaneTraceDirectory = async (projectDir: string, laneName?: string): Promise<string> =>
  (await import('./laneSession.mjs')).openLaneTraceDirectory(projectDir, laneName);

/**
 * 轨迹取料口。**返回类型刻意写成中立契约层的 `TrajectoryTurnInput[]` 而不是岛里的 `LaneTraceTurn[]`**
 * —— 这一行就是两处形状的漂移守卫：岛里那个类型哪天不再结构兼容，编译在这里当场红
 * （`electron/shared/agentLane/laneTrajectory.ts` 的注释里写了这条依赖）。
 */
export const readLaneTraceTurns = async (projectDir: string, laneName: string): Promise<TrajectoryTurnInput[]> =>
  (await import('./laneSession.mjs')).readLaneTraceTurns(projectDir, laneName);
