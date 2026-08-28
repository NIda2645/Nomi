import path from "node:path";

export const ROOT_CAUSE_CONTRACT_SCHEMA_VERSION = 2;

const PREVENTION_KINDS = new Set([
  "centralized-boundary",
  "schema-validation",
  "type-system",
  "runtime-assertion",
  "static-gate",
  "migration",
  "dependency-upgrade",
]);
const ENTRY_POINT_DISPOSITIONS = new Set(["enforced", "not-affected"]);
const DEPENDENCY_DECISIONS = new Set(["not-applicable", "upgrade-now", "retain-with-exit"]);

const HIGH_RISK_PREFIXES = [
  "electron/catalog/",
  "electron/assets/",
  "electron/comfyui/",
  "electron/image/",
  "electron/productionRun/",
  "electron/protocol/",
  "electron/providerAdapter/",
  "electron/tasks/",
  "electron/vendor/",
  "src/workbench/generationCanvas/runner/",
];

const HIGH_RISK_EXACT = new Set([
  "electron/ai/antigravityArtifacts.ts",
  "electron/hardenedFetch.ts",
  "electron/ipcSenderGuard.ts",
  "electron/workspace/workspaceRegistry.ts",
]);

function normalized(file) {
  return String(file || "").replaceAll(path.sep, "/").replace(/^\.\//, "");
}

function isTestFile(file) {
  return /(?:^|\/)(?:tests?|__tests__)(?:\/|$)/i.test(file)
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(file)
    || /\.node-test\.[cm]?js$/i.test(file);
}

export function isHighRiskProductionFile(file) {
  const name = normalized(file);
  if (isTestFile(name) || name.endsWith(".md") || name.endsWith(".json")) return false;
  return HIGH_RISK_EXACT.has(name)
    || name.startsWith("electron/runtime")
    || HIGH_RISK_PREFIXES.some((prefix) => name.startsWith(prefix))
    || (name.startsWith("electron/") && /(?:ipc|store|repository)\.ts$/i.test(name));
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyTextArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyText);
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scopeCovers(scope, file) {
  const cleanScope = normalized(scope);
  const cleanFile = normalized(file);
  if (cleanScope.endsWith("/**")) return cleanFile.startsWith(cleanScope.slice(0, -3));
  if (cleanScope.endsWith("/")) return cleanFile.startsWith(cleanScope);
  return cleanScope === cleanFile;
}

function pathExists(file, existingFiles) {
  const clean = normalized(file).replace(/\/\*\*$/, "");
  return clean.endsWith("/")
    ? [...existingFiles].some((candidate) => normalized(candidate).startsWith(clean))
    : existingFiles.has(clean) || [...existingFiles].some((candidate) => normalized(candidate).startsWith(`${clean}/`));
}

function pathIsInScope(file, scopePaths) {
  return scopePaths.some((scope) => scopeCovers(scope, file));
}

function validateV2Contract(contract, changed, existingFiles, label) {
  const errors = [];
  const scopePaths = Array.isArray(contract?.scope_paths) ? contract.scope_paths : [];
  const regressionTests = Array.isArray(contract?.regression_tests) ? contract.regression_tests : [];

  if (!nonEmptyText(contract?.generality_proof)) {
    errors.push(`${label}: generality_proof is required`);
  }

  const boundaries = Array.isArray(contract?.shared_boundaries) ? contract.shared_boundaries : [];
  if (boundaries.length === 0) {
    errors.push(`${label}: shared_boundaries must identify at least one production enforcement boundary`);
  }
  for (const boundary of boundaries) {
    if (!record(boundary) || !nonEmptyText(boundary.path) || !nonEmptyText(boundary.symbol) || !nonEmptyText(boundary.responsibility)) {
      errors.push(`${label}: every shared_boundaries entry requires path, symbol, and responsibility`);
      continue;
    }
    if (!pathExists(boundary.path, existingFiles)) errors.push(`${label}: shared boundary does not exist: ${boundary.path}`);
    if (!pathIsInScope(boundary.path, scopePaths)) errors.push(`${label}: shared boundary is not covered by scope_paths: ${boundary.path}`);
  }

  const equivalentEntries = Array.isArray(contract?.same_class_entry_points) ? contract.same_class_entry_points : [];
  if (equivalentEntries.length < 2) {
    errors.push(`${label}: same_class_entry_points must contain at least two independently checked entries`);
  }
  const entryIdentities = new Set();
  let enforcedEntryCount = 0;
  for (const entry of equivalentEntries) {
    if (!record(entry) || !nonEmptyText(entry.path) || !nonEmptyText(entry.entry_point) ||
      !ENTRY_POINT_DISPOSITIONS.has(entry.disposition) || !nonEmptyText(entry.evidence)) {
      errors.push(`${label}: every same_class_entry_points entry requires path, entry_point, enforced/not-affected disposition, and evidence`);
      continue;
    }
    if (!pathExists(entry.path, existingFiles)) errors.push(`${label}: same-class entry path does not exist: ${entry.path}`);
    if (entry.disposition === "enforced") enforcedEntryCount += 1;
    const identity = `${normalized(entry.path)}#${entry.entry_point.trim()}`;
    if (entryIdentities.has(identity)) errors.push(`${label}: duplicate same-class entry point: ${identity}`);
    entryIdentities.add(identity);
  }
  if (equivalentEntries.length > 0 && enforcedEntryCount === 0) {
    errors.push(`${label}: same_class_entry_points must include at least one enforced entry`);
  }

  const prevention = contract?.prevention;
  if (!record(prevention) || !PREVENTION_KINDS.has(prevention.kind) ||
    !nonEmptyText(prevention.enforcement_path) || !nonEmptyText(prevention.invariant) ||
    !nonEmptyText(prevention.failure_mode) || prevention.exception_policy !== "none") {
    errors.push(`${label}: prevention requires a supported kind, enforcement_path, invariant, failure_mode, and exception_policy "none"`);
  } else {
    if (!pathExists(prevention.enforcement_path, existingFiles)) {
      errors.push(`${label}: prevention enforcement_path does not exist: ${prevention.enforcement_path}`);
    }
    if (!changed.has(normalized(prevention.enforcement_path))) {
      errors.push(`${label}: prevention enforcement_path was not changed in this diff: ${prevention.enforcement_path}`);
    }
    if (!boundaries.some((boundary) => record(boundary) && normalized(boundary.path) === normalized(prevention.enforcement_path))) {
      errors.push(`${label}: prevention enforcement_path must be one of shared_boundaries`);
    }
  }

  const classTests = Array.isArray(contract?.class_regression_tests) ? contract.class_regression_tests : [];
  if (!nonEmptyTextArray(classTests)) {
    errors.push(`${label}: class_regression_tests must be a non-empty string array`);
  }
  for (const testFile of classTests) {
    const clean = normalized(testFile);
    if (!regressionTests.some((candidate) => normalized(candidate) === clean)) {
      errors.push(`${label}: class regression test is not listed in regression_tests: ${testFile}`);
    }
    if (!changed.has(clean)) errors.push(`${label}: class regression test was not changed in this diff: ${testFile}`);
  }

  const legacy = contract?.legacy_paths;
  if (!record(legacy) || !["removed", "not-applicable"].includes(legacy.status) ||
    !Array.isArray(legacy.removed_paths) || !nonEmptyText(legacy.rationale)) {
    errors.push(`${label}: legacy_paths requires removed/not-applicable status, removed_paths, and rationale`);
  } else if (legacy.status === "removed") {
    if (!nonEmptyTextArray(legacy.removed_paths)) errors.push(`${label}: removed legacy paths must be listed`);
    for (const removedPath of legacy.removed_paths) {
      if (!changed.has(normalized(removedPath))) errors.push(`${label}: removed legacy path was not changed in this diff: ${removedPath}`);
    }
  } else if (legacy.removed_paths.length !== 0) {
    errors.push(`${label}: not-applicable legacy_paths must have an empty removed_paths array`);
  }

  const lifecycle = contract?.dependency_lifecycle;
  if (!record(lifecycle) || !DEPENDENCY_DECISIONS.has(lifecycle.decision) || !nonEmptyText(lifecycle.rationale)) {
    errors.push(`${label}: dependency_lifecycle requires a supported decision and rationale`);
  } else if (lifecycle.decision === "not-applicable") {
    if (lifecycle.current !== undefined || lifecycle.target !== undefined ||
      !Array.isArray(lifecycle.exit_criteria) || lifecycle.exit_criteria.length !== 0) {
      errors.push(`${label}: not-applicable dependency_lifecycle must omit current/target and use empty exit_criteria`);
    }
  } else {
    if (!nonEmptyText(lifecycle.current) || !nonEmptyText(lifecycle.target)) {
      errors.push(`${label}: dependency lifecycle ${lifecycle.decision} requires current and target`);
    }
    if (!nonEmptyTextArray(lifecycle.exit_criteria)) {
      errors.push(`${label}: dependency lifecycle ${lifecycle.decision} requires explicit exit_criteria`);
    }
  }
  return errors;
}

function validateContract(contract, changed, existingFiles, index, legacyV1Hashes) {
  const label = nonEmptyText(contract?.id) ? contract.id : `contract #${index + 1}`;
  const errors = [];
  if (nonEmptyText(contract?.__file) && !changed.has(normalized(contract.__file))) {
    errors.push(`${label}: contract file was not changed in this diff: ${contract.__file}`);
  }
  if (contract?.schema_version === 1) {
    const expectedHash = legacyV1Hashes.get(normalized(contract?.__file));
    if (!expectedHash || expectedHash !== contract?.__contentHash) {
      errors.push(`${label}: changed or new schema v1 contracts must migrate to schema_version ${ROOT_CAUSE_CONTRACT_SCHEMA_VERSION}`);
    }
  } else if (contract?.schema_version !== ROOT_CAUSE_CONTRACT_SCHEMA_VERSION) {
    errors.push(`${label}: schema_version must be ${ROOT_CAUSE_CONTRACT_SCHEMA_VERSION}`);
  }
  for (const field of ["id", "problem_type", "symptom", "direct_cause", "class_root", "migration"]) {
    if (!nonEmptyText(contract?.[field])) errors.push(`${label}: ${field} is required`);
  }
  for (const field of ["affected_population", "scope_paths", "entry_points", "invariants", "regression_tests", "residual_risks"]) {
    if (!nonEmptyTextArray(contract?.[field])) errors.push(`${label}: ${field} must be a non-empty string array`);
  }

  const sources = Array.isArray(contract?.external_sources) ? contract.external_sources : [];
  const validSources = sources.every((source) =>
    source && typeof source === "object" &&
    ["official-doc", "source-code"].includes(source.kind) &&
    /^https?:\/\//i.test(String(source.url || "")) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(source.checked_at || "")) &&
    nonEmptyText(source.purpose));
  if ((!sources.length || !validSources) && !nonEmptyText(contract?.internal_only_reason)) {
    errors.push(`${label}: external_sources must contain checked official docs/source code, or internal_only_reason is required`);
  }

  for (const scope of Array.isArray(contract?.scope_paths) ? contract.scope_paths : []) {
    if (!pathExists(scope, existingFiles)) errors.push(`${label}: scope_paths entry does not exist: ${scope}`);
  }

  for (const testFile of Array.isArray(contract?.regression_tests) ? contract.regression_tests : []) {
    const clean = normalized(testFile);
    if (!isTestFile(clean)) errors.push(`${label}: regression_tests entry is not a test file: ${testFile}`);
    if (!existingFiles.has(clean)) errors.push(`${label}: regression test does not exist: ${testFile}`);
    if (!changed.has(clean)) errors.push(`${label}: regression test was not changed in this diff: ${testFile}`);
  }
  if (contract?.schema_version === ROOT_CAUSE_CONTRACT_SCHEMA_VERSION) {
    errors.push(...validateV2Contract(contract, changed, existingFiles, label));
  }
  return errors;
}

export function validateRootCauseHistory({ contracts, legacyV1Hashes = new Map() }) {
  const errors = [];
  const contractsByFile = new Map(contracts.map((contract) => [normalized(contract?.__file), contract]));
  for (const contract of contracts) {
    if (contract?.schema_version !== 1) continue;
    const file = normalized(contract?.__file);
    const expectedHash = legacyV1Hashes.get(file);
    if (!expectedHash) errors.push(`${file || contract?.id || "contract"}: new schema v1 contract is forbidden; use schema_version 2`);
    else if (expectedHash !== contract?.__contentHash) errors.push(`${file}: schema v1 history changed; migrate this contract to schema_version 2`);
  }
  for (const file of legacyV1Hashes.keys()) {
    if (!contractsByFile.has(normalized(file))) errors.push(`${file}: schema v1 history baseline points to a missing contract`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateRootCauseChange({ changedFiles, contracts, existingFiles, legacyV1Hashes = new Map() }) {
  const changed = new Set(changedFiles.map(normalized));
  const existing = new Set([...existingFiles].map(normalized));
  const triggeredFiles = [...changed].filter(isHighRiskProductionFile).sort();
  // 只有本次新增/修改的合同能为本次改动背书。历史合同仍可留作知识，但不会变成以后每次都要
  // 重写的永久枷锁；每个高风险文件只需至少一份“本次变化且完整”的合同覆盖。
  const changedContracts = contracts.filter((contract) =>
    nonEmptyText(contract?.__file) && changed.has(normalized(contract.__file)));
  const validatedContracts = new Set();
  const errors = [];
  for (const [index, contract] of changedContracts.entries()) {
    if (contract?.schema_version !== ROOT_CAUSE_CONTRACT_SCHEMA_VERSION) continue;
    errors.push(...validateContract(contract, changed, existing, index, legacyV1Hashes));
    validatedContracts.add(contract);
  }
  if (triggeredFiles.length === 0) return { ok: errors.length === 0, errors, triggeredFiles: [] };

  const relevantContracts = changedContracts.filter((contract) =>
    Array.isArray(contract?.scope_paths) && triggeredFiles.some((file) =>
      contract.scope_paths.some((scope) => scopeCovers(scope, file))));
  relevantContracts.forEach((contract, index) => {
    if (!validatedContracts.has(contract)) errors.push(...validateContract(contract, changed, existing, index, legacyV1Hashes));
  });
  for (const file of triggeredFiles) {
    const covered = relevantContracts.some((contract) =>
      Array.isArray(contract?.scope_paths) && contract.scope_paths.some((scope) => scopeCovers(scope, file)));
    if (!covered) errors.push(`High-risk production file is not covered by a root-cause contract: ${file}`);
  }
  if (relevantContracts.length === 0) {
    errors.push("Add a docs/fixes/*.root-cause.json contract for this high-risk production change.");
  }
  return { ok: errors.length === 0, errors, triggeredFiles };
}
