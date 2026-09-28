import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createProductionRunRepository } from './productionRunRepository';
import { createProductionRunService } from './productionRunService';
import { createProductionGenerationOperationStore } from './productionGenerationOperationStore';
import { productionTaskAbsenceCode } from './productionRunErrors';
import { productionRunPaths } from './productionRunPaths';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
it('K3 actual repository/service/operation owner never mints trusted absence from corrupt durable records', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-task-absence-')); roots.push(root);
  const paths = productionRunPaths(root, 'damaged');
  fs.mkdirSync(paths.dir, { recursive: true });
  fs.writeFileSync(paths.snapshot, '{synthetic-secret');
  const service = createProductionRunService({ repository: createProductionRunRepository({ projectDirResolver: () => root }),
    projectRootResolver: () => root, previewSecret: 'isolated-test', requestRenderer: async () => { throw new Error('unexpected renderer call'); } });
  const owner = createProductionGenerationOperationStore(service);
  let failure: unknown;
  try { owner.read('project', 'damaged'); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  expect(productionTaskAbsenceCode(failure)).toBeUndefined();
  expect(String(failure)).not.toContain('synthetic-secret');
  expect(() => owner.read('project', 'absent')).toThrow();
  try { owner.read('project', 'absent'); } catch (error) { expect(productionTaskAbsenceCode(error)).toBe('generation_operation_not_found'); }
});
