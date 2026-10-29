export const PIPELINE_QUEUE = 'pipeline';

/** Trabajos conocidos por el worker. Las etapas del pipeline se añaden en F3–F6. */
export const PipelineJob = {
  Ping: 'diagnostics.ping',
  TranscribeTurn: 'transcription.turn',
} as const;

export interface TranscribeTurnPayload {
  turnId: string;
}
