import type { StoryboardPlan } from '../../generationCanvas/agent/storyboardPlan'
import type { StoryboardNodeBindings } from './exec/storyboardRowStatus'

/** Binds storage identity and existing nodes, never the original editor's layout. */
export type StoryboardEditorHost = {
  designId: string
  documentId: string
  plan: StoryboardPlan | null
  bindings: StoryboardNodeBindings
  saving: boolean
  error: boolean
  recover(): Promise<void>
  change(plan: StoryboardPlan): void
  flush(): Promise<void>
  assertCurrent(): Promise<void>
}
