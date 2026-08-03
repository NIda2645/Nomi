import React from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import type { Scene3DObject, Scene3DTrajectoryBinding } from '../scene3dTypes'
import { findSceneObjectByRuntimeId } from '../scene3dMath'
import { objectVisualHalfHeight } from '../scene3dCrowd'
import { useTrajectoryAnimation } from './useTrajectoryAnimation'
import {
  registerScene3DObjectRef,
  setScene3DObjectRuntimeRefsVisible,
  unregisterScene3DObjectRef,
  useScene3DTrajectoryRuntimeStore,
} from './trajectoryRuntimeStore'

/**
 * Resolves the live THREE.Object3D for a bound scene object/camera by id and
 * registers it into the trajectory runtime store so the playback hook can drive
 * it. Scene object/camera marker groups carry their id in
 * `userData[SCENE3D_RUNTIME_ID_KEY]`. Registration is scoped to timeline/playback
 * mode only, so it never interferes with normal editing.
 *
 * positionLift = 脚底→视觉中心的抬升（objectVisualHalfHeight，与导出采样
 * objectWithPlaybackPose 的 +halfHeight 同源）。场景对象必传；相机/aim 合成 id
 * 传 null（相机无抬升语义，导出侧 cameraWithPlaybackPosition 也不抬）。
 */
function bindableObjectIds(bindings: Scene3DTrajectoryBinding[]): string[] {
  return Array.from(new Set(bindings.flatMap((binding) => binding.objects.map((object) => object.objectId))))
}

function ObjectRefBinder({ objectId, positionLift }: { objectId: string; positionLift: number | null }): null {
  const { scene } = useThree()

  React.useEffect(() => {
    const found = findSceneObjectByRuntimeId(scene, objectId)
    if (!found) return undefined
    const ref = { current: found } as React.MutableRefObject<THREE.Object3D>
    registerScene3DObjectRef(
      objectId,
      ref,
      positionLift ? { positionOffset: new THREE.Vector3(0, positionLift, 0) } : {},
    )
    return () => {
      unregisterScene3DObjectRef(objectId, ref)
      // After playback releases the object, force it visible so a hidden
      // closed-loop frame never persists; the next render reapplies the authored
      // transform.
      setScene3DObjectRuntimeRefsVisible(objectId, true)
    }
  }, [objectId, positionLift, scene])

  return null
}

export function TrajectoryPlayback({
  bindings,
  objects,
  isPlaying,
  setIsPlaying,
  playheadRef,
  activeTrajectoryIds,
}: {
  bindings: Scene3DTrajectoryBinding[]
  objects: Scene3DObject[]
  isPlaying: boolean
  setIsPlaying: (playing: boolean) => void
  playheadRef: React.MutableRefObject<number>
  activeTrajectoryIds?: ReadonlySet<string> | null
}): JSX.Element {
  const bindTargets = React.useMemo(() => (
    bindableObjectIds(bindings).flatMap((objectId) => {
      const object = objects.find((candidate) => candidate.id === objectId)
      // state 里隐藏的对象不注册直驱——保持隐藏，与导出一致（objectWithPlaybackPose 保留 visible=false）。
      if (object && !object.visible) return []
      return [{ objectId, positionLift: object ? objectVisualHalfHeight(object) : null }]
    })
  ), [bindings, objects])
  useTrajectoryAnimation({ isPlaying, setIsPlaying, playheadRef, activeTrajectoryIds })

  // frameloop='demand' 下暂停拖播放头没有帧 → useTrajectoryAnimation 的 useFrame 不跑，
  // 3D 对象停在旧位置（时间轴默认常显后不再靠 timelineOpen 强制 'always'）。订阅播放头
  // 变化手动请一帧，让摆位逻辑应用新播放头；播放中（'always'）invalidate 是空操作，零成本。
  const invalidate = useThree((state) => state.invalidate)
  React.useEffect(() => useScene3DTrajectoryRuntimeStore.subscribe(
    (state) => state.playheadSeconds,
    () => invalidate(),
  ), [invalidate])

  return (
    <>
      {bindTargets.map(({ objectId, positionLift }) => (
        <ObjectRefBinder key={objectId} objectId={objectId} positionLift={positionLift} />
      ))}
    </>
  )
}
