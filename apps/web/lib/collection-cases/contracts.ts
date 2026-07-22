import { z } from 'zod';

export const promiseStatuses = [
  'ACTIVE',
  'DUE',
  'BROKEN',
  'FULFILLED',
  'CANCELLED',
] as const;
export const disputeCategories = [
  'MISSING_POD',
  'WRONG_AMOUNT',
  'WRONG_QUANTITY',
  'QUALITY',
  'ADMINISTRATIVE',
  'OTHER',
] as const;
export const disputeStatuses = ['OPEN', 'RESOLVED'] as const;

export const collectionCaseIdSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const businessDateSchema = z.iso.date();
const responseMoneySchema = z.string().regex(/^\d+\.\d{2}$/);
const actorSchema = z
  .object({
    id: collectionCaseIdSchema,
    name: z.string().min(1).max(200),
    role: z.enum(['OWNER', 'OPERATOR']),
  })
  .strict();
const safeText = (maximum: number) =>
  z
    .string()
    .transform(normalizeMultilineText)
    .pipe(z.string().min(1).max(maximum))
    .refine(hasSafeCharacters, 'Contains unsupported characters');

export const promiseViewSchema = z
  .object({
    id: collectionCaseIdSchema,
    invoiceId: collectionCaseIdSchema.optional(),
    amount: responseMoneySchema,
    promiseDate: businessDateSchema,
    status: z.enum(promiseStatuses),
    fulfilledAt: timestampSchema.nullable(),
    cancelledAt: timestampSchema.nullable(),
    cancelReason: z.string().max(500).nullable(),
    createdBy: actorSchema,
    cancelledBy: actorSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const disputeViewSchema = z
  .object({
    id: collectionCaseIdSchema,
    invoiceId: collectionCaseIdSchema.optional(),
    category: z.enum(disputeCategories),
    details: z.string().min(1).max(2_000),
    status: z.enum(disputeStatuses),
    resolutionNote: z.string().min(1).max(1_000).nullable(),
    createdBy: actorSchema,
    resolvedBy: actorSchema.nullable(),
    resolvedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const createPromiseInputSchema = z
  .object({
    amount: z
      .string()
      .trim()
      .regex(/^\d+(?:\.\d{1,2})?$/, 'Enter a valid amount')
      .refine(isPositiveMoney, 'Amount must be greater than zero'),
    promiseDate: businessDateSchema,
  })
  .strict();
export const cancelPromiseInputSchema = z
  .object({ reason: safeText(500) })
  .strict();
export const createDisputeInputSchema = z
  .object({
    category: z.enum(disputeCategories),
    details: safeText(2_000),
  })
  .strict();
export const resolveDisputeInputSchema = z
  .object({ resolutionNote: safeText(1_000).nullable() })
  .strict();

export const promiseCommandResponseSchema = z
  .object({
    data: promiseViewSchema.extend({ invoiceId: collectionCaseIdSchema }),
    replayed: z.boolean(),
  })
  .strict();
export const disputeCommandResponseSchema = z
  .object({
    data: disputeViewSchema.extend({ invoiceId: collectionCaseIdSchema }),
    replayed: z.boolean(),
  })
  .strict();

export type PromiseView = z.infer<typeof promiseViewSchema>;
export type DisputeView = z.infer<typeof disputeViewSchema>;
export type DisputeCategory = (typeof disputeCategories)[number];
export type CreatePromiseInput = z.input<typeof createPromiseInputSchema>;
export type CancelPromiseInput = z.input<typeof cancelPromiseInputSchema>;
export type CreateDisputeInput = z.input<typeof createDisputeInputSchema>;
export type ResolveDisputeInput = z.input<typeof resolveDisputeInputSchema>;
export type PromiseCommandResponse = z.infer<
  typeof promiseCommandResponseSchema
>;
export type DisputeCommandResponse = z.infer<
  typeof disputeCommandResponseSchema
>;

function normalizeMultilineText(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
}

function hasSafeCharacters(value: string): boolean {
  return Array.from(value).every((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return false;
    if (codePoint === 9 || codePoint === 10) return true;
    if (codePoint < 32 || (codePoint >= 127 && codePoint <= 159)) return false;
    if (codePoint === 0x200e || codePoint === 0x200f) return false;
    if (codePoint >= 0x202a && codePoint <= 0x202e) return false;
    return codePoint < 0x2066 || codePoint > 0x2069;
  });
}

function isPositiveMoney(value: string): boolean {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) > 0n;
}
