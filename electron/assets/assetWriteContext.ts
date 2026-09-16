import fs from 'node:fs'
import { projectDirById } from '../projects/repository'
import { assertProjectAgentBinding, sameProjectAgentBinding, type ProjectBinding } from '../shared/projectBinding'
import { ensureWorkspaceProjectIdentity } from '../workspace/workspaceProjectIdentity'
import { withWorkspaceManifestMutationSync } from '../workspace/workspaceManifest'

export type AssetWriteContext = Readonly<{
  projectId: string
  root: string
  binding: ProjectBinding
  assertCurrent(): void
}>

function stale(): never { throw Object.assign(new Error('project_binding_stale'), { code: 'project_binding_stale' }) }

/** Every async store entry captures identity, even explicit/background project IO.
 * A trusted main-process interaction assertion can additionally revoke the write. */
export async function captureAssetWriteContext(
  projectId: string,
  expected?: ProjectBinding,
  assertInteraction?: () => void,
): Promise<AssetWriteContext> {
  assertInteraction?.()
  if (expected) { assertProjectAgentBinding(expected); if (expected.projectId !== projectId) stale() }
  const resolved = projectDirById(projectId)
  if (!resolved) throw Object.assign(new Error('project_identity_unavailable'), { code: 'project_identity_unavailable' })
  const root = fs.realpathSync(resolved)
  const originalStat = fs.statSync(root)
  const identity = await ensureWorkspaceProjectIdentity(root)
  const binding = Object.freeze({ projectId, immutableProjectUuid: identity.immutableProjectUuid, projectGeneration: identity.projectGeneration })
  if (identity.projectId !== projectId || (expected && !sameProjectAgentBinding(expected, binding))) stale()
  const assertCurrent = (): void => {
    assertInteraction?.()
    const currentRoot = projectDirById(projectId)
    if (!currentRoot || fs.realpathSync(currentRoot) !== root) stale()
    const stat = fs.statSync(root)
    if (stat.dev !== originalStat.dev || stat.ino !== originalStat.ino) stale()
    withWorkspaceManifestMutationSync(root, ({ current }) => {
      if (!current || current.id !== projectId || current.immutableProjectUuid !== binding.immutableProjectUuid || current.projectGeneration !== binding.projectGeneration) stale()
    }, undefined, { localizeEmbeddedMedia: false })
  }
  assertCurrent()
  return Object.freeze({ projectId, root, binding, assertCurrent })
}
