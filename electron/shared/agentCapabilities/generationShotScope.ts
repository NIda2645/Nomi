/** Resolve a requested subset atomically, retaining the owner's stable order. */
export function resolveGenerationShotScope(available: readonly string[], requested: unknown): string[] {
  if (requested === undefined) return [...available];
  if (!Array.isArray(requested) || requested.length === 0) throw new Error("generation_scope_invalid: shotIds must be a non-empty array");
  const selected = new Set<string>();
  for (const value of requested) {
    if (typeof value !== "string" || !value.trim()) throw new Error("generation_scope_invalid: invalid shot id");
    const id = value.trim();
    if (selected.has(id)) throw new Error(`generation_scope_invalid: duplicate shot ${id}`);
    if (!available.includes(id)) throw new Error(`generation_scope_invalid: unknown shot ${id}`);
    selected.add(id);
  }
  return available.filter((id) => selected.has(id));
}
