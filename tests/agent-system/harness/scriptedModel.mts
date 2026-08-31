export type ModelStep =
  | { kind: 'assistant_text'; text: string }
  | { kind: 'tool_call'; name: string; arguments: unknown; callId: string }
  | { kind: 'approval_request'; reason: string }
  | { kind: 'user_input'; text: string }
  | { kind: 'interrupt' }
  | { kind: 'malformed_output'; payload: unknown }

export type ConsumedModelStep = ModelStep & {
  index: number
}

export type ScriptedModel = {
  next: () => ModelStep
  peek: () => ModelStep | undefined
  remaining: () => number
  consumed: () => readonly ConsumedModelStep[]
  assertComplete: () => void
}

export function createScriptedModel(steps: readonly ModelStep[]): ScriptedModel {
  const script = steps.map((step) => structuredClone(step))
  const consumed: ConsumedModelStep[] = []
  let index = 0

  function next(): ModelStep {
    if (index >= script.length) throw new Error('Scripted model exhausted')
    const step = structuredClone(script[index]) as ModelStep
    consumed.push({ ...step, index })
    index += 1
    return step
  }

  function peek(): ModelStep | undefined {
    return index < script.length ? (structuredClone(script[index]) as ModelStep) : undefined
  }

  function remaining(): number {
    return script.length - index
  }

  function assertComplete(): void {
    if (index === script.length) return
    const missing = script
      .slice(index)
      .map((step, offset) => `${index + offset}:${step.kind}`)
      .join(', ')
    throw new Error(`Unconsumed scripted model steps: ${missing}`)
  }

  return {
    next,
    peek,
    remaining,
    consumed: () => consumed.map((step) => structuredClone(step)),
    assertComplete,
  }
}
