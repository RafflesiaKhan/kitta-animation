// A vector character being created in the background (server/vector-create.ts), as the form shows it.

/** front: painting the front picture; face: the face sheet; drawing: the drawing rounds; then done. */
export type VectorJobStage = 'front' | 'face' | 'drawing' | 'done' | 'failed' | 'cancelled' | 'interrupted';
export const RUNNING_STAGES: VectorJobStage[] = ['front', 'face', 'drawing'];

export interface VectorJob {
  /** Also the id of the character it makes. */
  id: string;
  name: string;
  description: string;
  /** Who paints the pictures and who draws the parts. */
  imageProvider: 'gemini' | 'openai';
  drawProvider: 'anthropic' | 'openai';
  /** The drawing model's id (older jobs may not have it). */
  drawModel?: string;
  stage: VectorJobStage;
  /** Drawing rounds finished so far, out of maxRounds. */
  round: number;
  maxRounds: number;
  /** Check errors of the latest drawing round. */
  errors: number | null;
  /** USD spent so far (pictures and drawing), from the usage ledger's prices. */
  cost: number;
  /** Which pictures exist, for the form to show. */
  hasFront: boolean;
  hasFace: boolean;
  hasCheck: boolean;
  /** Why it failed or stopped, in words for the person. */
  message?: string;
  startedAt: string;
  updatedAt: string;
}
