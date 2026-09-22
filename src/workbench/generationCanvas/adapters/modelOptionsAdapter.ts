import { parseImageModelCatalogConfig, parseVideoModelCatalogConfig } from '../../../config/modelCatalogMeta'
import {
  deriveModelCatalogStatus,
  findModelOptionByIdentifier as findCatalogModelOptionByIdentifier,
  useModelOptions,
  useModelOptionsState,
  type ModelOptionsState,
} from '../../../config/useModelOptions'
import { normalizeOrientation, type Orientation } from '../../../utils/orientation'
import i18n from '../../../i18n'
import { translateModelDisplayText } from '../../../i18n/modelDisplayText'
import type { ModelOption, NodeKind } from '../../../config/models'
import type { ProfileKind } from '../../api/modelCatalogApi'
import type { GenerationCanvasEdge, GenerationCanvasNode, GenerationNodeKind } from '../model/generationCanvasTypes'
import { getGenerationNodeCatalogKind } from '../model/generationNodeKinds'
import { resolveGenerationReferences } from '../runner/generationReferenceResolver'
import { resolveTaskKind } from '../runner/catalogTaskResolve'

export function findModelOptionByIdentifier(
  options: readonly ModelOption[],
  value: string | null | undefined,
  vendor?: string | null | undefined,
): ModelOption | null {
  return findCatalogModelOptionByIdentifier(options, value, vendor)
}

export function useGenerationModelOptions(kind: GenerationNodeKind, requiredMode?: ProfileKind): ModelOption[] {
  return useModelOptions(toCatalogNodeKind(kind, requiredMode), requiredMode)
}

export function useGenerationModelOptionsState(kind: GenerationNodeKind, requiredMode?: ProfileKind): ModelOptionsState {
  return useModelOptionsState(toCatalogNodeKind(kind, requiredMode), requiredMode)
}

export function deriveGenerationModelCatalogStatus(kind: GenerationNodeKind, state: ModelOptionsState) {
  return deriveModelCatalogStatus({
    kind: toCatalogNodeKind(kind),
    options: state.options,
    health: state.health,
    error: state.error,
    healthError: state.healthError,
    loading: state.loading,
  })
}

function toCatalogNodeKind(kind: GenerationNodeKind, requiredMode?: ProfileKind): NodeKind {
  if (requiredMode === 'image_edit') return 'imageEdit'
  return getGenerationNodeCatalogKind(kind)
}

export function requiredModeForGenerationNode(
  node: GenerationCanvasNode,
  context: { nodes?: GenerationCanvasNode[]; edges?: GenerationCanvasEdge[] } = {},
): ProfileKind {
  try {
    return resolveTaskKind(node, resolveGenerationReferences(node, context)) as ProfileKind
  } catch {
    const kind = getGenerationNodeCatalogKind(node.kind)
    if (kind === 'image') return 'text_to_image'
    if (kind === 'video') return 'text_to_video'
    if (kind === 'audio') return 'text_to_audio'
    if (kind === 'model3d') return 'text_to_3d'
    return 'chat'
  }
}

export function readImageCatalogConfig(option: ModelOption | null | undefined) {
  return parseImageModelCatalogConfig(option?.meta)
}

export function readVideoCatalogConfig(option: ModelOption | null | undefined) {
  return parseVideoModelCatalogConfig(option?.meta)
}

export function getNodeSelectedModelValue(node: GenerationCanvasNode): string {
  return String(
    node.meta?.modelKey || node.meta?.modelAlias || node.meta?.imageModel || node.meta?.videoModel || '',
  ).trim()
}

export function updateNodeModelParams(
  node: GenerationCanvasNode,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(node.meta || {}),
    ...patch,
  }
}

export function normalizeImageAspect(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
}

export function normalizeImageSize(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
}

export function normalizeVideoDuration(value: string | number): number | null {
  const next = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(next) && next > 0 ? Math.trunc(next) : null
}

export function normalizeVideoOrientation(value: Orientation | string): Orientation {
  return normalizeOrientation(value)
}

export function getImageModelControlLabels(option: ModelOption | null | undefined) {
  const config = parseImageModelCatalogConfig(option?.meta)
  return {
    config,
    aspectLabel:
      translateModelDisplayText(config?.controls.find((control) => control.binding === 'aspectRatio')?.label || '') ||
      i18n.t('runtime.modelCatalog.control.frame'),
    sizeLabel:
      translateModelDisplayText(config?.controls.find((control) => control.binding === 'imageSize')?.label || '') ||
      i18n.t('runtime.modelCatalog.control.size'),
    resolutionLabel:
      translateModelDisplayText(config?.controls.find((control) => control.binding === 'resolution')?.label || '') ||
      i18n.t('runtime.modelCatalog.control.resolution'),
  }
}

export function getVideoModelControlLabels(option: ModelOption | null | undefined) {
  const config = parseVideoModelCatalogConfig(option?.meta)
  return {
    config,
    durationLabel:
      translateModelDisplayText(config?.controls.find((control) => control.binding === 'durationSeconds')?.label || '') ||
      i18n.t('runtime.modelCatalog.control.duration'),
    sizeLabel:
      translateModelDisplayText(config?.controls.find((control) => control.binding === 'size')?.label || '') ||
      i18n.t('runtime.modelCatalog.control.frame'),
    resolutionLabel:
      translateModelDisplayText(config?.controls.find((control) => control.binding === 'resolution')?.label || '') ||
      i18n.t('runtime.modelCatalog.control.resolution'),
    orientationLabel:
      translateModelDisplayText(config?.controls.find((control) => control.binding === 'orientation')?.label || '') ||
      i18n.t('runtime.modelCatalog.control.orientation'),
  }
}
