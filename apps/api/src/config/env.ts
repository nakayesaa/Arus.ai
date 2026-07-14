import { z } from 'zod';

const postgresUrl = z
  .url()
  .refine(
    (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
    'Must be a PostgreSQL connection URL',
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
