// A reference-made SVG character being generated in the background (server/svg-rig-create.ts), as the form shows it.

/** design: reading the reference; front: drawing and checking the front view; views: the other views; assemble: binding and publishing. */
export type RigJobStage = 'design' | 'front' | 'views' | 'assemble' | 'done' | 'failed' | 'cancelled' | 'interrupted';
export const RIG_RUNNING_STAGES: RigJobStage[] = ['design', 'front', 'views', 'assemble'];
export type RigProvider = 'anthropic' | 'openai';

export interface RigJob {
  /** Also the id of the character it makes. */
  id: string;
  name: string;
  description: string;
  /** Snapshot of who draws, for the whole job (resume keeps it). */
  provider: RigProvider;
  model: string;
  stage: RigJobStage;
  /** Views accepted so far (front first). */
  viewsDone: string[];
  /** Views this job draws (the rest are mirrored). */
  viewsPlanned: string[];
  /** Model calls made and the part of them that were repairs; bounded per run. */
  calls: number;
  repairs: number;
  /** Tokens and USD spent so far, from the usage ledger. */
  input: number;
  output: number;
  cost: number;
  /** Rendered sheets to show: the latest front check, the finished character sheet. */
  hasCheck: boolean;
  hasSheet: boolean;
  /** What the design step noted the reference did not show. */
  inferred?: string;
  message?: string;
  startedAt: string;
  updatedAt: string;
}

/** A model that can draw a character from a reference (image input and tool calls). */
export interface RigModel { provider: RigProvider; model: string; label: string }
