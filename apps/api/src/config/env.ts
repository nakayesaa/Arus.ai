import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  API_ORIGIN: z.url().default('http://localhost:4000'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
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
