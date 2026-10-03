import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { DIRECTOR_ASSET_CATALOG } from '../workbench/generationCanvas/nodes/director/model/assetCatalog'

const actionAssets = DIRECTOR_ASSET_CATALOG.filter((asset) => asset.kind === 'action')
const propAssets = DIRECTOR_ASSET_CATALOG.filter((asset) => asset.kind !== 'action' && asset.kind !== 'pose')
const gltfLoader = new GLTFLoader()
const fbxLoader = new FBXLoader()
const gltfCache = new Map<string, THREE.Group>()
const clipCache = new Map<string, THREE.AnimationClip>()

function useAssetCanvas(asset: (typeof DIRECTOR_ASSET_CATALOG)[number]) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('loading')
  useEffect(() => {
    let dead = false
    const canvas = ref.current
    if (!canvas) return
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(320, 220, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#171b22')
    scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x263040, 2.2))
    const key = new THREE.DirectionalLight(0xffffff, 2.8); key.position.set(3, 5, 4); scene.add(key)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: '#2b313b', roughness: 0.9 }))
    ground.rotation.x = -Math.PI / 2
    ground.position.y = 0
    scene.add(ground)
    const camera = new THREE.PerspectiveCamera(32, 320 / 220, 0.01, 100); camera.position.set(2.5, 1.5, 3.8)
    camera.lookAt(0, 1, 0)
    let mixer: THREE.AnimationMixer | undefined
    let root: THREE.Object3D | undefined
    const load = async () => {
      try {
        if (asset.kind === 'action') {
          if (asset.file.endsWith('.glb')) {
            const loaded = await gltfLoader.loadAsync('/' + asset.file)
            root = loaded.scene
            root.traverse((node) => { if ((node as THREE.Mesh).isMesh) { const mesh = node as THREE.Mesh; mesh.castShadow = true; mesh.frustumCulled = false; mesh.material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }) } })
            scene.add(root); root.updateMatrixWorld(true)
            const box = new THREE.Box3().setFromObject(root); const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3()); const max = Math.max(size.x, size.y, size.z); camera.position.set(center.x + max * 2.2, center.y + max * 0.9, center.z + max * 2.2); camera.lookAt(center)
            const clip = loaded.animations.find((candidate) => candidate.name === asset.clipName) ?? loaded.animations[0]
            if (!clip) throw new Error('GLB animation missing')
            mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play(); setStatus('rendered')
          } else {
            let source = gltfCache.get('xbot')
            if (!source) { source = (await gltfLoader.loadAsync('/src/assets/x-bot.glb')).scene; gltfCache.set('xbot', source) }
            root = cloneSkeleton(source)
            root.traverse((node) => { if ((node as THREE.Mesh).isMesh) { const mesh = node as THREE.Mesh; mesh.castShadow = true; mesh.frustumCulled = false; mesh.material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }) } })
            scene.add(root); root.updateMatrixWorld(true)
            const modelBox = new THREE.Box3().setFromObject(root); const modelSize = modelBox.getSize(new THREE.Vector3()); const modelCenter = modelBox.getCenter(new THREE.Vector3()); const modelMax = Math.max(modelSize.x, modelSize.y, modelSize.z); camera.position.set(modelCenter.x + modelMax * 2.2, modelCenter.y + modelMax * 0.9, modelCenter.z + modelMax * 2.2); camera.lookAt(modelCenter)
            const fbx = await fbxLoader.loadAsync('/' + asset.file)
            const clip = fbx.animations[0]
            clip.tracks = clip.tracks.filter((track) => track.name.endsWith('.quaternion') || track.name === 'mixamorigHips.position').map((track) => { track.name = track.name.replace('mixamorig:', 'mixamorig'); return track })
            mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play(); setStatus('rendered')
          }
        } else {
          const loaded = await gltfLoader.loadAsync('/' + asset.file); root = loaded.scene; root.traverse((node) => { if ((node as THREE.Mesh).isMesh) (node as THREE.Mesh).frustumCulled = false }); if (!root) throw new Error('prop root missing')
          scene.add(root); setStatus('rendered')
          const box = new THREE.Box3().setFromObject(root); const size = box.getSize(new THREE.Vector3()); const max = Math.max(size.x, size.y, size.z); camera.position.set(max * 2.4, max * 1.5, max * 2.4); camera.lookAt(0, size.y * 0.45, 0)
        }
      } catch (error) { console.error(error); setStatus('error') }
    }
    void load()
    const clock = new THREE.Clock(); let frame = 0
    const tick = () => { if (dead) return; const delta = clock.getDelta(); mixer?.update(delta); renderer.render(scene, camera); frame = requestAnimationFrame(tick) }
    tick()
    return () => { dead = true; cancelAnimationFrame(frame); renderer.dispose(); scene.clear() }
  }, [asset])
  return { ref, status }
}

function App() {
  const selectedId = new URLSearchParams(window.location.search).get('asset') ?? actionAssets[0].id
  const selected = DIRECTOR_ASSET_CATALOG.find((asset) => asset.id === selectedId) ?? actionAssets[0]
  const { ref, status } = useAssetCanvas(selected)
  const groups = [
    ['动作', actionAssets],
    ['道具 / 积木', propAssets],
  ] as const
  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
    <h1 style={{ margin: '0 0 6px', fontSize: 24 }}>Director 3D-BOX Asset Lab</h1>
    <p style={{ color: '#aab4c4', marginTop: 0 }}>A 期素材真渲染目检：一次只开一个 WebGL context，使用链接逐项检查动作和道具（动作用检查材质便于读骨骼连续性）。</p>
    <section style={{ display: 'grid', gridTemplateColumns: 'minmax(480px, 1fr) 280px', gap: 20, alignItems: 'start' }}>
      <article style={{ background: '#20252e', border: '1px solid #323b49', borderRadius: 10, overflow: 'hidden' }}>
        <canvas ref={ref} width={640} height={440} style={{ display: 'block', width: '100%', height: 440 }} />
        <div style={{ padding: '10px 12px 12px' }}><strong>{selected.nameZh} / {selected.nameEn}</strong><div style={{ color: '#9eabbc', fontSize: 12, marginTop: 4 }}>{selected.id} · {status} · {selected.file}</div></div>
      </article>
      <aside style={{ maxHeight: 690, overflow: 'auto', paddingRight: 4 }}>{groups.map(([title, assets]) => <div key={title}><h2 style={{ fontSize: 14, margin: '0 0 8px' }}>{title} ({assets.length})</h2>{assets.map((asset) => <a key={asset.id} href={`?asset=${encodeURIComponent(asset.id)}`} style={{ display: 'block', padding: '6px 8px', borderRadius: 6, color: asset.id === selected.id ? '#fff' : '#aab4c4', background: asset.id === selected.id ? '#33445a' : 'transparent', textDecoration: 'none', fontSize: 13 }}>{asset.nameZh} / {asset.nameEn}</a>)}</div>)}</aside>
    </section>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
