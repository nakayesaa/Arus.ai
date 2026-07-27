import { z } from 'zod';

const postgresUrl = z
  .url()
  .refine(
    (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
    'Must be a PostgreSQL connection URL',
  );
const optionalSecret = (minimum: number) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(minimum).max(2_048).optional(),
  );

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().max(65_535).default(4000),
    APP_ORIGIN: z.url().default('http://localhost:3000'),
    API_ORIGIN: z.url().default('http://localhost:4000'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: postgresUrl,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60_000)
      .default(10_000),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(30_000),
    SESSION_SECRET: z.string().min(32).max(512),
    SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(24 * 7),
    AUTH_LOGIN_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(60 * 60 * 1_000)
      .default(15 * 60 * 1_000),
    AUTH_LOGIN_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10),
    PASSWORD_RESET_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(60 * 60 * 1_000)
      .default(15 * 60 * 1_000),
    PASSWORD_RESET_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5),
    INVITATION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 7)
      .default(72),
    PASSWORD_RESET_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(15)
      .max(120)
      .default(60),
    EMAIL_DELIVERY_MODE: z.enum(['file', 'resend']).default('file'),
    EMAIL_FROM: z
      .string()
      .trim()
      .min(3)
      .max(320)
      .default('Arus <accounts@example.com>'),
    RESEND_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(20).max(512).optional(),
    ),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    WHATSAPP_PROVIDER_MODE: z.enum(['double', 'meta']).default('double'),
    WHATSAPP_APP_SECRET: optionalSecret(16),
    WHATSAPP_VERIFY_TOKEN: optionalSecret(16),
    WHATSAPP_ACCESS_TOKEN: optionalSecret(20),
    WHATSAPP_PHONE_NUMBER_ID: optionalSecret(3),
    WHATSAPP_WABA_ID: optionalSecret(3),
    WHATSAPP_GRAPH_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/u)
      .default('v23.0'),
    WHATSAPP_WEBHOOK_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(1024 * 1024)
      .default(256 * 1024),
    WHATSAPP_EVIDENCE_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(20 * 1024 * 1024)
      .default(8 * 1024 * 1024),
    WHATSAPP_WORKER_POLL_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(60_000)
      .default(2_000),
    WHATSAPP_WORKER_LEASE_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(5 * 60_000)
      .default(30_000),
    EVIDENCE_STORAGE_MODE: z.enum(['memory', 'supabase']).default('memory'),
    SUPABASE_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url().optional(),
    ),
    SUPABASE_SERVICE_ROLE_KEY: optionalSecret(20),
    WHATSAPP_EVIDENCE_BUCKET: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .default('whatsapp-evidence'),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      environment.SESSION_SECRET.startsWith('replace-')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'Production session secret cannot use the example value',
      });
    }

    if (
      environment.NODE_ENV === 'production' &&
      new URL(environment.APP_ORIGIN).protocol !== 'https:'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'Production application origin must use HTTPS',
      });
    }

    if (
      environment.NODE_ENV === 'production' &&
      (environment.EMAIL_DELIVERY_MODE !== 'resend' ||
        !environment.RESEND_API_KEY)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_DELIVERY_MODE'],
        message: 'Production requires configured email delivery',
      });
    }

    if (
      environment.NODE_ENV === 'production' &&
      environment.EMAIL_FROM.includes('@example.com')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM'],
        message: 'Production sender must use a verified domain',
      });
    }

    if (environment.WHATSAPP_PROVIDER_MODE === 'meta') {
      for (const key of [
        'WHATSAPP_APP_SECRET',
        'WHATSAPP_VERIFY_TOKEN',
        'WHATSAPP_ACCESS_TOKEN',
        'WHATSAPP_PHONE_NUMBER_ID',
        'WHATSAPP_WABA_ID',
      ] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: 'Meta provider mode requires this secret',
          });
        }
      }
    }

    if (
      environment.EVIDENCE_STORAGE_MODE === 'supabase' &&
      (!environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['EVIDENCE_STORAGE_MODE'],
        message: 'Supabase storage mode requires URL and service role key',
      });
    }

    if (
      environment.NODE_ENV === 'production' &&
      (environment.WHATSAPP_PROVIDER_MODE !== 'meta' ||
        environment.EVIDENCE_STORAGE_MODE !== 'supabase')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['WHATSAPP_PROVIDER_MODE'],
        message: 'Production requires Meta and private Supabase storage',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join('.') || 'environment')
      .join(', ');

    throw new Error(`Invalid environment configuration: ${fields}`);
  }

  return result.data;
}
