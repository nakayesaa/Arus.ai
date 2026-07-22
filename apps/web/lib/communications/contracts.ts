import { z } from 'zod';

export const communicationChannels = [
  'WHATSAPP',
  'CALL',
  'EMAIL',
  'OTHER',
] as const;

export const communicationEntityIdSchema = z.uuid();
const idSchema = communicationEntityIdSchema;
const timestampSchema = z.iso.datetime({ offset: true });
const businessDateSchema = z.iso.date();
const safeNotesSchema = z
  .string()
  .transform((value) => value.replaceAll('\r\n', '\n').trim())
  .pipe(z.string().min(1).max(2_000))
  .refine(noUnsafeCharacters, 'Notes contain unsupported characters');

const actorSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).max(200),
    role: z.enum(['OWNER', 'OPERATOR']),
  })
  .strict();

export const communicationTimelineEntrySchema = z
  .object({
    id: idSchema,
    occurredAt: timestampSchema,
    channel: z.enum(communicationChannels),
    notes: z.string().min(1).max(2_000),
    nextFollowUpDate: businessDateSchema.nullable(),
    actor: actorSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const nextFollowUpSuggestionSchema = z.discriminatedUnion('basis', [
  z
    .object({
      date: businessDateSchema,
      basis: z.enum(['STANDARD_NEXT_DAY', 'ACTIVE_PROMISE']),
    })
    .strict(),
  z.object({ date: z.null(), basis: z.literal('OPEN_DISPUTE') }).strict(),
]);

export const recordCommunicationInputSchema = z
  .object({
    channel: z.enum(communicationChannels),
    notes: safeNotesSchema,
    nextFollowUpDate: businessDateSchema.nullable(),
  })
  .strict();

export const recordCommunicationResponseSchema = z
  .object({
    data: communicationTimelineEntrySchema.extend({ invoiceId: idSchema }),
    replayed: z.boolean(),
  })
  .strict();

export type CommunicationChannel = (typeof communicationChannels)[number];
export type CommunicationTimelineEntry = z.infer<
  typeof communicationTimelineEntrySchema
>;
export type RecordCommunicationInput = z.input<
  typeof recordCommunicationInputSchema
>;
export type RecordCommunicationResponse = z.infer<
  typeof recordCommunicationResponseSchema
>;

function noUnsafeCharacters(value: string): boolean {
  return Array.from(value).every((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return false;
    const allowedWhitespace = character === '\n' || character === '\t';
    const control =
      (codePoint < 32 && !allowedWhitespace) ||
      (codePoint >= 127 && codePoint <= 159);
    const directionalControl = codePoint >= 0x202a && codePoint <= 0x202e;
    return !control && !directionalControl;
  });
}
