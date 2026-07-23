import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';

import { PrismaClient } from '../apps/api/src/generated/prisma/client.js';
import {
  seedAllocations,
  seedCommunications,
  seedDebtors,
  seedDisputes,
  seedInvoices,
  seedOrganizations,
  seedPayments,
  seedPromises,
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

  for (const communication of seedCommunications) {
    await prisma.communication.upsert({
      where: { id: communication.id },
      update: {
        organizationId: communication.organizationId,
        invoiceId: communication.invoiceId,
        actorId: communication.actorId,
        actorRole: communication.actorRole,
        operationKey: communication.operationKey,
        occurredAt: new Date(communication.occurredAt),
        channel: communication.channel,
        notes: communication.notes,
        nextFollowUpDate: asDatabaseDate(communication.nextFollowUpDate),
      },
      create: {
        ...communication,
        occurredAt: new Date(communication.occurredAt),
        nextFollowUpDate: asDatabaseDate(communication.nextFollowUpDate),
      },
    });
  }

  for (const promise of seedPromises) {
    await prisma.promiseToPay.upsert({
      where: { id: promise.id },
      update: {
        organizationId: promise.organizationId,
        invoiceId: promise.invoiceId,
        amount: promise.amount,
        promiseDate: asDatabaseDate(promise.promiseDate),
        createdById: promise.createdById,
        createdByRole: promise.createdByRole,
        operationKey: promise.operationKey,
        finalStatus: promise.finalStatus,
        fulfilledAt: asTimestamp(promise.fulfilledAt),
        cancelledAt: asTimestamp(promise.cancelledAt),
        cancelledById: promise.cancelledById,
        cancelledByRole: promise.cancelledByRole,
        cancelReason: promise.cancelReason,
        cancellationOperationKey: promise.cancellationOperationKey,
      },
      create: {
        ...promise,
        promiseDate: asDatabaseDate(promise.promiseDate),
        fulfilledAt: asTimestamp(promise.fulfilledAt),
        cancelledAt: asTimestamp(promise.cancelledAt),
        createdAt: new Date(promise.createdAt),
      },
    });
  }

  for (const dispute of seedDisputes) {
    await prisma.dispute.upsert({
      where: { id: dispute.id },
      update: {
        organizationId: dispute.organizationId,
        invoiceId: dispute.invoiceId,
        category: dispute.category,
        details: dispute.details,
        status: dispute.status,
        createdById: dispute.createdById,
        createdByRole: dispute.createdByRole,
        operationKey: dispute.operationKey,
        resolvedById: dispute.resolvedById,
        resolvedByRole: dispute.resolvedByRole,
        resolvedAt: asTimestamp(dispute.resolvedAt),
        resolutionNote: dispute.resolutionNote,
        resolutionOperationKey: dispute.resolutionOperationKey,
      },
      create: {
        ...dispute,
        resolvedAt: asTimestamp(dispute.resolvedAt),
        createdAt: new Date(dispute.createdAt),
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
        payerReference: payment.payerReference,
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
      `${seedCommunications.length} communications`,
      `${seedPromises.length} promises`,
      `${seedDisputes.length} disputes`,
      `${seedPayments.length} payments`,
      `and ${seedAllocations.length} allocations`,
    ].join(', '),
  );
}

function asDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function asTimestamp(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
