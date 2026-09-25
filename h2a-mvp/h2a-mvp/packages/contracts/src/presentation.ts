import { z } from 'zod';
import { guidedWorkflowIdSchema } from './guided-workflow';

export const presentationModeSchema = z.enum(['office', 'control']);
export type PresentationMode = z.infer<typeof presentationModeSchema>;

export const appearancePreferencesSchema = z.object({
  schema_version: z.literal(1),
  presentation_mode: presentationModeSchema,
  reduced_motion: z.boolean(),
  camera_position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().default({ x: 0, y: 0 }),
  zoom: z.number().finite().min(0.5).max(2).default(1),
  inspector_width: z.number().int().min(280).max(640).default(360),
  selected_workflow_id: guidedWorkflowIdSchema.optional(),
  updated_at: z.string().datetime({ offset: true })
}).strict();
export type AppearancePreferences = z.infer<typeof appearancePreferencesSchema>;

export const updateAppearancePreferencesSchema = z.object({
  presentation_mode: presentationModeSchema.optional(),
  reduced_motion: z.boolean().optional(),
  camera_position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional(),
  zoom: z.number().finite().min(0.5).max(2).optional(),
  inspector_width: z.number().int().min(280).max(640).optional(),
  selected_workflow_id: guidedWorkflowIdSchema.optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one appearance preference is required.');
export type UpdateAppearancePreferences = z.infer<typeof updateAppearancePreferencesSchema>;
