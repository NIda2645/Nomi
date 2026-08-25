import type { LanguageModelV1 } from "ai";
import type { Model } from "../catalog/types";
import { redactAdapterSecrets } from "./redaction";
import type { LoadedConnection } from "./serviceCatalog";
import { AdapterWaitError } from "./serviceLifecycle";
import { appendCompilation, emptyCompilation, genericCompilation } from "./serviceFallback";
import type { DiscoveredDocs } from "./docsDiscovery";
import type { ProviderAdapterCompilation } from "./types";

export async function compileMediaModels(input: {
  connection: LoadedConnection;
  models: readonly Model[];
  docs: DiscoveredDocs;
  languageModels: readonly LanguageModelV1[];
  onModel: (modelKey: string) => void;
  compileOne: (model: Model) => Promise<ProviderAdapterCompilation>;
}): Promise<{ compilation: ProviderAdapterCompilation; compiledModelKeys: Set<string> }> {
  if (input.docs.sources.length === 0 || !input.docs.corpus.trim() || input.languageModels.length === 0) {
    return { compilation: genericCompilation(input.connection, input.models), compiledModelKeys: new Set() };
  }

  let compilation = emptyCompilation(input.connection);
  const compiledModelKeys = new Set<string>();
  for (const model of input.models) {
    input.onModel(model.modelKey);
    let generated: ProviderAdapterCompilation | undefined;
    try {
      generated = await input.compileOne(model);
    } catch (error) {
      if (error instanceof AdapterWaitError && error.reason !== "step_timeout") throw error;
      const message = redactAdapterSecrets(error instanceof Error ? error.message : String(error));
      const fallback = genericCompilation(input.connection, [model]);
      compilation = appendCompilation(compilation, {
        ...fallback,
        failures: fallback.failures.map((failure) => ({
          ...failure,
          error: `${failure.error} (${message})`,
        })),
      }, model.modelKey);
      continue;
    }

    const candidate = generated.draft.models.find((item) => item.modelKey === model.modelKey && item.modes.length > 0);
    if (candidate) {
      compilation = appendCompilation(compilation, {
        draft: { ...generated.draft, models: [candidate] },
        failures: [],
      }, model.modelKey);
      compiledModelKeys.add(model.modelKey);
      continue;
    }
    compilation = appendCompilation(compilation, genericCompilation(input.connection, [model]), model.modelKey);
  }
  return { compilation, compiledModelKeys };
}
