import { isDeepStrictEqual } from 'node:util'
import { isJsonRecord } from '../jsonUtils'
import { buildImportedWorkflow, normalizeWorkflowBinding, parseComfyApiWorkflow } from './comfyuiWorkflowImport'
import { comfyOutputKind, resolveComfyWorkflowOutput } from './comfyuiWorkflowOutput'
import { isComfyuiVendor, selectTaskMapping, type CatalogState } from './types'

const contracts = [
  { kind: 'image', field: 'image_url', tasks: ['text_to_image', 'image_edit'] },
  { kind: 'video', field: 'video_url', tasks: ['text_to_video', 'image_to_video'] },
  { kind: 'model3d', field: 'model_url', tasks: ['text_to_3d', 'image_to_3d'] },
] as const

function executesOutput(body: unknown, outputNodeId: string): boolean {
  if (!isJsonRecord(body) || !isJsonRecord(body.prompt) || !isJsonRecord(body.prompt[outputNodeId])) return false
  const targets = body.partial_execution_targets
  // Nomi's template/request transforms preserve these values. ComfyUI validate_prompt
  // executes all outputs for omitted/null targets, but [] selects no outputs.
  return targets == null || (Array.isArray(targets)
    && targets.every((target) => typeof target === 'string') && targets.includes(outputNodeId))
}

/** v9 → v10: repair only provable native ComfyUI contracts; never rebuild user settings/enums. */
export function migrateComfyWorkflowOutputs(state: CatalogState): CatalogState {
  let mappings = state.mappings
  const models = state.models.map((model) => {
    if (!isComfyuiVendor({ key: model.vendorKey }) || !isJsonRecord(model.meta)) return model
    const draft = model.meta.comfyWorkflowImport
    if (!isJsonRecord(draft) || typeof draft.text !== 'string' || !isJsonRecord(draft.binding)) return model
    try {
      const graph = parseComfyApiWorkflow(draft.text)
      const binding = normalizeWorkflowBinding(draft.binding, graph)
      const output = resolveComfyWorkflowOutput(graph, binding)
      // Unknown custom outputs require the author's declaration, not an automatic migration.
      if (!comfyOutputKind(graph[output.outputNodeId]?.class_type ?? '')) return model
      if (model.kind === output.outputKind && binding.outputKind === output.outputKind && binding.outputNodeId === output.outputNodeId) return model
      const built = buildImportedWorkflow(graph, { ...binding, ...output })
      const field = output.outputKind === 'video' ? 'video_url' : output.outputKind === 'model3d' ? 'model_url' : 'image_url'
      let unsafeExecutionSelection = false
      const nextMappings = mappings.map((mapping) => {
        if (mapping.vendorKey !== model.vendorKey || mapping.modelKey !== model.modelKey
          || mapping.create?.request_transform !== 'comfyui-prompt' || mapping.query?.response_transform !== 'comfyui-history') return mapping
        const body = mapping.create.body
        // A second task may intentionally use a different graph. Only repair the generated draft's contract.
        if (!isJsonRecord(body) || !isDeepStrictEqual(body.prompt, built.templatedGraph)) return mapping
        const response = { ...mapping.query.response_mapping }
        const media = contracts.filter((contract) => Object.prototype.hasOwnProperty.call(response, contract.field))
        const previous = media[0]
        if (media.length !== 1 || !previous || response[previous.field] !== previous.field
          || (previous.kind !== model.kind && previous.kind !== binding.outputKind)
          || mapping.taskKind !== previous.tasks[built.taskKind.startsWith('image_') ? 1 : 0]) return mapping
        const repairTarget = binding.outputNodeId !== output.outputNodeId
          && isDeepStrictEqual(body.partial_execution_targets, [binding.outputNodeId])
        // A custom selection must already execute the saver. Never change its meaning
        // or let another mapping authorize an upgrade of this enabled contract.
        if (!repairTarget && !executesOutput(body, output.outputNodeId)) {
          if (mapping.enabled) unsafeExecutionSelection = true
          return mapping
        }
        if (mapping.taskKind !== built.taskKind && mappings.some((other) => other !== mapping
          && other.vendorKey === model.vendorKey && other.modelKey === model.modelKey && other.taskKind === built.taskKind)) return mapping
        delete response[previous.field]
        response[field] = field
        return {
          ...mapping,
          taskKind: built.taskKind,
          create: repairTarget ? { ...mapping.create, body: { ...body, partial_execution_targets: [output.outputNodeId] } } : mapping.create,
          query: { ...mapping.query, response_mapping: response },
        }
      })
      // Do not strand a model in a new kind with only old-kind mappings. The repair is atomic.
      if (unsafeExecutionSelection) return model
      const executable = selectTaskMapping(nextMappings, model.vendorKey, built.taskKind, model.modelKey)
      const executableBody = executable?.create?.body
      if (executable?.modelKey !== model.modelKey || !executable.query?.response_mapping?.[field]
        || !isJsonRecord(executableBody) || !isDeepStrictEqual(executableBody.prompt, built.templatedGraph)
        || !executesOutput(executableBody, output.outputNodeId)) return model
      mappings = nextMappings
      return {
        ...model,
        kind: output.outputKind,
        meta: { ...model.meta, comfyWorkflowImport: { ...draft, binding: { ...draft.binding, ...output } } },
      }
    } catch {
      // A deleted/custom output or corrupt draft must not block the rest of the user's catalog.
      return model
    }
  })
  return { ...state, models, mappings }
}
