import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

import { PrismaClient } from '../apps/api/src/generated/prisma/client.js';
import { seedOrganizations, seedUsers } from './seed-data.js';

function requireEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to seed the database`);
  }

  return value;
}

const databaseUrl = requireEnvironment('DATABASE_URL');
const demoPassword = requireEnvironment('DEMO_SEED_PASSWORD');

if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo seed is forbidden in production');
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(demoPassword, 12);

  for (const organization of seedOrganizations) {
    await prisma.organization.upsert({
      where: { id: organization.id },
      update: {
        name: organization.name,
        timezone: organization.timezone,
      },
      create: organization,
    });
  }

  for (const user of seedUsers) {
    await prisma.user.upsert({
      where: { normalizedEmail: user.normalizedEmail },
      update: {
        email: user.email,
        normalizedEmail: user.normalizedEmail,
        name: user.name,
        passwordHash,
        isActive: true,
      },
      create: {
        id: user.id,
        email: user.email,
        normalizedEmail: user.normalizedEmail,
        name: user.name,
        passwordHash,
      },
    });

    await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: user.organizationId,
        },
      },
      update: {
        role: user.role,
        isActive: true,
      },
      create: {
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
      },
    });
  }

  console.info(
    `Seeded ${seedOrganizations.length} organizations and ${seedUsers.length} users`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
