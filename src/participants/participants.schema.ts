import { z } from 'zod';

export const updateParticipantSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    // Declarada por la persona; nunca se infiere del nombre (decisión D5).
    grammaticalForm: z.enum(['feminine', 'masculine', 'neutral']).optional(),
    // Aceptar el consentimiento registra la versión del texto y la fecha. El texto legal está pendiente (D7).
    consentVersion: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export type UpdateParticipantInput = z.infer<typeof updateParticipantSchema>;
