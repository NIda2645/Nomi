import { z } from 'zod';

const jobId = z.string().trim().min(1).max(160);
export const taskReferenceSchema = z.discriminatedUnion('domain', [
  z.object({ domain: z.literal('generation'), jobId }).strict(),
  z.object({ domain: z.literal('export'), jobId }).strict(),
]);
export type TaskReference = z.infer<typeof taskReferenceSchema>;
export const taskDomainSchema = z.enum(['generation', 'export']);

export function generationTaskReference(operationId: string): TaskReference {
  return { domain: 'generation', jobId: operationId };
}
