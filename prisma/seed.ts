import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

import { PrismaClient } from '../apps/api/src/generated/prisma/client.js';
import {
  seedAllocations,
  seedDebtors,
  seedInvoices,
  seedOrganizations,
  seedPayments,
  seedUsers,
} from './seed-data.js';

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
  const acceptedAt = new Date('2026-07-01T00:00:00.000Z');

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
        acceptedAt,
      },
      create: {
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        acceptedAt,
      },
    });
  }

  for (const debtor of seedDebtors) {
    await prisma.debtor.upsert({
      where: { id: debtor.id },
      update: {
        organizationId: debtor.organizationId,
        code: debtor.code,
        normalizedCode: debtor.normalizedCode,
        name: debtor.name,
        normalizedName: debtor.normalizedName,
        contactName: debtor.contactName,
        phoneNumber: debtor.phoneNumber,
        email: debtor.email,
        deletedAt: null,
      },
      create: debtor,
    });
  }

  for (const invoice of seedInvoices) {
    await prisma.invoice.upsert({
      where: { id: invoice.id },
      update: {
        organizationId: invoice.organizationId,
        debtorId: invoice.debtorId,
        invoiceNumber: invoice.invoiceNumber,
        normalizedInvoiceNumber: invoice.normalizedInvoiceNumber,
        invoiceDate: asDatabaseDate(invoice.invoiceDate),
        dueDate: asDatabaseDate(invoice.dueDate),
        originalAmount: invoice.originalAmount,
        description: invoice.description,
        deletedAt: null,
      },
      create: {
        ...invoice,
        invoiceDate: asDatabaseDate(invoice.invoiceDate),
        dueDate: asDatabaseDate(invoice.dueDate),
      },
    });
  }

  for (const payment of seedPayments) {
    await prisma.payment.upsert({
      where: { id: payment.id },
      update: {
        organizationId: payment.organizationId,
        debtorId: payment.debtorId,
        paymentDate: asDatabaseDate(payment.paymentDate),
        amount: payment.amount,
        bankReference: payment.bankReference,
        isOpeningBalance: payment.isOpeningBalance,
        createdById: payment.createdById,
      },
      create: {
        ...payment,
        paymentDate: asDatabaseDate(payment.paymentDate),
      },
    });
  }

  for (const allocation of seedAllocations) {
    await prisma.paymentAllocation.upsert({
      where: { id: allocation.id },
      update: {
        organizationId: allocation.organizationId,
        paymentId: allocation.paymentId,
        invoiceId: allocation.invoiceId,
        amount: allocation.amount,
        allocationDate: asDatabaseDate(allocation.allocationDate),
        createdById: allocation.createdById,
        reversedAt: allocation.reversedAt
          ? new Date(allocation.reversedAt)
          : null,
        reversalReason: allocation.reversalReason,
      },
      create: {
        ...allocation,
        allocationDate: asDatabaseDate(allocation.allocationDate),
        reversedAt: allocation.reversedAt
          ? new Date(allocation.reversedAt)
          : null,
      },
    });
  }

  console.info(
    [
      `Seeded ${seedOrganizations.length} organizations`,
      `${seedUsers.length} users`,
      `${seedDebtors.length} debtors`,
      `${seedInvoices.length} invoices`,
      `${seedPayments.length} payments`,
      `and ${seedAllocations.length} allocations`,
    ].join(', '),
  );
}

function asDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
