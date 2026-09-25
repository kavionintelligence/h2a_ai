import { z } from 'zod';

const id = z.string().trim().min(1).max(240);
const text = z.string().trim().min(1).max(4000);
const iso = z.string().datetime({ offset: true });

export const collaborativeGoalSchema = z.object({
  schema_version: z.literal(1),
  goal_id: id,
  organization_id: id,
  project_id: id,
  title: z.string().trim().min(1).max(160),
  objective: text,
  outcome: text,
  constraints: z.array(z.string().trim().min(1).max(500)).max(50),
  deadline: iso.nullable(),
  sensitivity: z.enum(['public', 'internal', 'confidential', 'restricted']),
  expected_outputs: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
  created_by_human_id: id,
  trace_id: id,
  status: z.enum(['draft', 'planned', 'approved', 'running', 'blocked', 'completed', 'cancelled']),
  created_at: iso,
  updated_at: iso
}).strict();
export type CollaborativeGoal = z.infer<typeof collaborativeGoalSchema>;
