import {
  CommunicationChannel,
  DisputeCategory,
  DisputeStatus,
  MembershipRole,
  PromiseFinalStatus,
} from '../apps/api/src/generated/prisma/enums.js';

export const demoAsOfDate = validDemoDate(
  process.env.DEMO_TODAY ?? '2026-07-23',
);

export const seedOrganizations = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Demo Indonesia',
    timezone: 'Asia/Jakarta',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Boundary Test Organization',
    timezone: 'Asia/Jakarta',
  },
] as const;

export const seedUsers = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'owner@demo.arus.local',
    normalizedEmail: 'owner@demo.arus.local',
    name: 'Demo Owner',
    organizationId: seedOrganizations[0].id,
    role: MembershipRole.OWNER,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    email: 'operator@demo.arus.local',
    normalizedEmail: 'operator@demo.arus.local',
    name: 'Demo Operator',
    organizationId: seedOrganizations[0].id,
    role: MembershipRole.OPERATOR,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    email: 'owner@boundary.arus.local',
    normalizedEmail: 'owner@boundary.arus.local',
    name: 'Boundary Owner',
    organizationId: seedOrganizations[1].id,
    role: MembershipRole.OWNER,
  },
] as const;

const baseSeedDebtors = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    organizationId: seedOrganizations[0].id,
    code: 'CUST-001',
    normalizedCode: 'cust-001',
    name: 'PT Sinar Abadi Retail',
    normalizedName: 'pt sinar abadi retail',
    contactName: 'Andi Saputra',
    phoneNumber: '+62 812 1000 0001',
    email: 'finance@sinar-abadi.example',
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    organizationId: seedOrganizations[0].id,
    code: 'CUST-002',
    normalizedCode: 'cust-002',
    name: 'PT Cipta Pangan Indonesia',
    normalizedName: 'pt cipta pangan indonesia',
    contactName: 'Rina Hartono',
    phoneNumber: '+62 812 1000 0002',
    email: 'ar@cipta-pangan.example',
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    organizationId: seedOrganizations[0].id,
    code: 'CUST-003',
    normalizedCode: 'cust-003',
    name: 'PT Metro Logistik',
    normalizedName: 'pt metro logistik',
    contactName: 'Dimas Pratama',
    phoneNumber: '+62 812 1000 0003',
    email: 'accounting@metro-logistik.example',
  },
  {
    id: '20000000-0000-4000-8000-000000000004',
    organizationId: seedOrganizations[1].id,
    code: 'CUST-001',
    normalizedCode: 'cust-001',
    name: 'Boundary Customer',
    normalizedName: 'boundary customer',
    contactName: null,
    phoneNumber: null,
    email: null,
  },
] as const;

const generatedDebtorNames = [
  'PT Arunika Distribusi',
  'CV Berkah Mandiri',
  'PT Nusantara Medika',
  'PT Karya Sentosa Teknik',
  'CV Lautan Pangan',
  'PT Prima Kemasan',
  'PT Griya Furnindo',
  'CV Tumbuh Bersama',
  'PT Bintang Timur Niaga',
  'PT Delta Sarana Digital',
  'CV Sumber Makmur',
  'PT Wahana Konstruksi',
] as const;

const generatedSeedDebtors = generatedDebtorNames.map((name, index) => {
  const sequence = index + 4;
  return {
    id: seedId('2', index + 101),
    organizationId: seedOrganizations[0].id,
    code: `CUST-${String(sequence).padStart(3, '0')}`,
    normalizedCode: `cust-${String(sequence).padStart(3, '0')}`,
    name,
    normalizedName: name.toLocaleLowerCase('id-ID'),
    contactName: [
      'Sari Wulandari',
      'Fajar Ramadhan',
      'Nadia Permata',
      'Rizky Hidayat',
    ][index % 4]!,
    phoneNumber: `+62 812 1000 ${String(sequence).padStart(4, '0')}`,
    email: `finance-${String(sequence).padStart(3, '0')}@demo-customer.example`,
  };
});

export const seedDebtors = [
  ...baseSeedDebtors,
  ...generatedSeedDebtors,
] as const;

const baseSeedInvoices = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    organizationId: seedOrganizations[0].id,
    debtorId: seedDebtors[0].id,
    invoiceNumber: 'INV-2026-0418',
    normalizedInvoiceNumber: 'inv-2026-0418',
    invoiceDate: shiftDate(demoAsOfDate, -84),
    dueDate: shiftDate(demoAsOfDate, -54),
    originalAmount: '185000000.00',
    description: 'Synthetic partial-payment boundary invoice',
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    organizationId: seedOrganizations[0].id,
    debtorId: seedDebtors[1].id,
    invoiceNumber: 'INV-2026-0074',
    normalizedInvoiceNumber: 'inv-2026-0074',
    invoiceDate: shiftDate(demoAsOfDate, -38),
    dueDate: shiftDate(demoAsOfDate, -8),
    originalAmount: '315000000.00',
    description: 'Synthetic open overdue invoice',
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    organizationId: seedOrganizations[0].id,
    debtorId: seedDebtors[2].id,
    invoiceNumber: 'INV-2026-0090',
    normalizedInvoiceNumber: 'inv-2026-0090',
    invoiceDate: shiftDate(demoAsOfDate, -30),
    dueDate: demoAsOfDate,
    originalAmount: '90000000.00',
    description: 'Synthetic due-soon invoice',
  },
  {
    id: '30000000-0000-4000-8000-000000000004',
    organizationId: seedOrganizations[0].id,
    debtorId: seedDebtors[0].id,
    invoiceNumber: 'INV-2026-0020',
    normalizedInvoiceNumber: 'inv-2026-0020',
    invoiceDate: shiftDate(demoAsOfDate, -128),
    dueDate: shiftDate(demoAsOfDate, -98),
    originalAmount: '50000000.00',
    description: 'Synthetic fully-paid historical invoice',
  },
  {
    id: '30000000-0000-4000-8000-000000000005',
    organizationId: seedOrganizations[0].id,
    debtorId: seedDebtors[2].id,
    invoiceNumber: 'INV-2026-0060',
    normalizedInvoiceNumber: 'inv-2026-0060',
    invoiceDate: shiftDate(demoAsOfDate, -44),
    dueDate: shiftDate(demoAsOfDate, -14),
    originalAmount: '75000000.00',
    description: 'Synthetic reversed-allocation invoice',
  },
  {
    id: '30000000-0000-4000-8000-000000000006',
    organizationId: seedOrganizations[1].id,
    debtorId: seedDebtors[3].id,
    invoiceNumber: 'INV-2026-0418',
    normalizedInvoiceNumber: 'inv-2026-0418',
    invoiceDate: '2026-06-01',
    dueDate: '2026-06-30',
    originalAmount: '10000000.00',
    description: 'Cross-tenant invoice identity boundary',
  },
] as const;

const generatedDueOffsets = [
  21, 14, 7, 2, 0, -3, -9, -18, -27, -42, -68, -96,
] as const;

const generatedSeedInvoices = Array.from({ length: 75 }, (_, index) => {
  const debtor = seedDebtors[index % 15]!;
  const dueDate = shiftDate(
    demoAsOfDate,
    generatedDueOffsets[index % generatedDueOffsets.length]!,
  );
  const amount = 8_000_000 + (index % 12) * 7_500_000;
  const sequence = index + 1_001;
  return {
    id: seedId('3', index + 101),
    organizationId: seedOrganizations[0].id,
    debtorId: debtor.id,
    invoiceNumber: `INV-2026-${sequence}`,
    normalizedInvoiceNumber: `inv-2026-${sequence}`,
    invoiceDate: shiftDate(dueDate, -30),
    dueDate,
    originalAmount: money(amount),
    description: `Synthetic demo receivable ${sequence}`,
  };
});

export const seedInvoices = [
  ...baseSeedInvoices,
  ...generatedSeedInvoices,
] as const;

const baseSeedCommunications = [
  {
    id: '60000000-0000-4000-8000-000000000001',
    organizationId: seedOrganizations[0].id,
    invoiceId: seedInvoices[0].id,
    actorId: seedUsers[0].id,
    actorRole: MembershipRole.OWNER,
    operationKey: '70000000-0000-4000-8000-000000000001',
    occurredAt: `${shiftDate(demoAsOfDate, -12)}T03:00:00.000Z`,
    channel: CommunicationChannel.EMAIL,
    notes:
      'Sent invoice evidence to accounts payable for internal approval review.',
    nextFollowUpDate: shiftDate(demoAsOfDate, -9),
  },
  {
    id: '60000000-0000-4000-8000-000000000002',
    organizationId: seedOrganizations[0].id,
    invoiceId: seedInvoices[0].id,
    actorId: seedUsers[1].id,
    actorRole: MembershipRole.OPERATOR,
    operationKey: '70000000-0000-4000-8000-000000000002',
    occurredAt: `${shiftDate(demoAsOfDate, -9)}T03:30:00.000Z`,
    channel: CommunicationChannel.CALL,
    notes:
      'Accounts payable confirmed the invoice is in approval. Follow up after finance review.',
    nextFollowUpDate: shiftDate(demoAsOfDate, -5),
  },
] as const;

const generatedSeedCommunications = Array.from({ length: 10 }, (_, index) => {
  const occurredDate = shiftDate(demoAsOfDate, -(index + 1));
  return {
    id: seedId('6', index + 101),
    organizationId: seedOrganizations[0].id,
    invoiceId: generatedSeedInvoices[index + 5]!.id,
    actorId: seedUsers[index % 2]!.id,
    actorRole: index % 2 === 0 ? MembershipRole.OWNER : MembershipRole.OPERATOR,
    operationKey: seedId('7', index + 101),
    occurredAt: `${occurredDate}T03:00:00.000Z`,
    channel: [
      CommunicationChannel.WHATSAPP,
      CommunicationChannel.CALL,
      CommunicationChannel.EMAIL,
    ][index % 3]!,
    notes: [
      'Accounts payable confirmed the invoice is queued for approval.',
      'Customer requested the supporting delivery document.',
      'Finance contact confirmed the proposed payment date.',
      'Follow-up completed; internal approval is still in progress.',
    ][index % 4]!,
    nextFollowUpDate: shiftDate(demoAsOfDate, (index % 5) - 2),
  };
});

export const seedCommunications = [
  ...baseSeedCommunications,
  ...generatedSeedCommunications,
] as const;

const baseSeedPromises = [
  {
    id: '80000000-0000-4000-8000-000000000001',
    organizationId: seedOrganizations[0].id,
    invoiceId: seedInvoices[0].id,
    amount: '75000000.00',
    promiseDate: shiftDate(demoAsOfDate, -7),
    createdById: seedUsers[1].id,
    createdByRole: MembershipRole.OPERATOR,
    operationKey: '81000000-0000-4000-8000-000000000001',
    finalStatus: null,
    fulfilledAt: null,
    cancelledAt: null,
    cancelledById: null,
    cancelledByRole: null,
    cancelReason: null,
    cancellationOperationKey: null,
    createdAt: `${shiftDate(demoAsOfDate, -9)}T03:30:00.000Z`,
  },
  {
    id: '80000000-0000-4000-8000-000000000002',
    organizationId: seedOrganizations[0].id,
    invoiceId: seedInvoices[1].id,
    amount: '100000000.00',
    promiseDate: shiftDate(demoAsOfDate, -8),
    createdById: seedUsers[0].id,
    createdByRole: MembershipRole.OWNER,
    operationKey: '81000000-0000-4000-8000-000000000002',
    finalStatus: null,
    fulfilledAt: null,
    cancelledAt: null,
    cancelledById: null,
    cancelledByRole: null,
    cancelReason: null,
    cancellationOperationKey: null,
    createdAt: `${shiftDate(demoAsOfDate, -13)}T02:00:00.000Z`,
  },
  {
    id: '80000000-0000-4000-8000-000000000003',
    organizationId: seedOrganizations[0].id,
    invoiceId: seedInvoices[2].id,
    amount: '45000000.00',
    promiseDate: demoAsOfDate,
    createdById: seedUsers[1].id,
    createdByRole: MembershipRole.OPERATOR,
    operationKey: '81000000-0000-4000-8000-000000000003',
    finalStatus: null,
    fulfilledAt: null,
    cancelledAt: null,
    cancelledById: null,
    cancelledByRole: null,
    cancelReason: null,
    cancellationOperationKey: null,
    createdAt: `${shiftDate(demoAsOfDate, -8)}T04:00:00.000Z`,
  },
  {
    id: '80000000-0000-4000-8000-000000000004',
    organizationId: seedOrganizations[0].id,
    invoiceId: seedInvoices[3].id,
    amount: '50000000.00',
    promiseDate: shiftDate(demoAsOfDate, -98),
    createdById: seedUsers[0].id,
    createdByRole: MembershipRole.OWNER,
    operationKey: '81000000-0000-4000-8000-000000000004',
    finalStatus: PromiseFinalStatus.FULFILLED,
    fulfilledAt: `${shiftDate(demoAsOfDate, -99)}T03:00:00.000Z`,
    cancelledAt: null,
    cancelledById: null,
    cancelledByRole: null,
    cancelReason: null,
    cancellationOperationKey: null,
    createdAt: `${shiftDate(demoAsOfDate, -104)}T03:00:00.000Z`,
  },
  {
    id: '80000000-0000-4000-8000-000000000005',
    organizationId: seedOrganizations[0].id,
    invoiceId: seedInvoices[0].id,
    amount: '25000000.00',
    promiseDate: shiftDate(demoAsOfDate, -11),
    createdById: seedUsers[0].id,
    createdByRole: MembershipRole.OWNER,
    operationKey: '81000000-0000-4000-8000-000000000005',
    finalStatus: PromiseFinalStatus.CANCELLED,
    fulfilledAt: null,
    cancelledAt: `${shiftDate(demoAsOfDate, -12)}T05:00:00.000Z`,
    cancelledById: seedUsers[0].id,
    cancelledByRole: MembershipRole.OWNER,
    cancelReason: 'Customer corrected the proposed payment schedule.',
    cancellationOperationKey: '82000000-0000-4000-8000-000000000005',
    createdAt: `${shiftDate(demoAsOfDate, -13)}T03:00:00.000Z`,
  },
] as const;

const generatedSeedPromises = Array.from({ length: 8 }, (_, index) => {
  const status = index % 4;
  const promiseDate =
    status === 0
      ? shiftDate(demoAsOfDate, 3 + index)
      : status === 1
        ? shiftDate(demoAsOfDate, -(index + 1))
        : shiftDate(demoAsOfDate, -(index % 3));
  const finalStatus =
    status === 2
      ? PromiseFinalStatus.FULFILLED
      : status === 3
        ? PromiseFinalStatus.CANCELLED
        : null;
  return {
    id: seedId('8', index + 101),
    organizationId: seedOrganizations[0].id,
    invoiceId: generatedSeedInvoices[index + 16]!.id,
    amount: money(5_000_000 + (index % 3) * 2_500_000),
    promiseDate,
    createdById: seedUsers[index % 2]!.id,
    createdByRole:
      index % 2 === 0 ? MembershipRole.OWNER : MembershipRole.OPERATOR,
    operationKey: seedId('8', index + 201),
    finalStatus,
    fulfilledAt:
      finalStatus === PromiseFinalStatus.FULFILLED
        ? `${shiftDate(demoAsOfDate, -1)}T03:00:00.000Z`
        : null,
    cancelledAt:
      finalStatus === PromiseFinalStatus.CANCELLED
        ? `${shiftDate(demoAsOfDate, -2)}T03:00:00.000Z`
        : null,
    cancelledById:
      finalStatus === PromiseFinalStatus.CANCELLED ? seedUsers[0].id : null,
    cancelledByRole:
      finalStatus === PromiseFinalStatus.CANCELLED
        ? MembershipRole.OWNER
        : null,
    cancelReason:
      finalStatus === PromiseFinalStatus.CANCELLED
        ? 'Customer replaced the commitment with a revised schedule.'
        : null,
    cancellationOperationKey:
      finalStatus === PromiseFinalStatus.CANCELLED
        ? seedId('8', index + 301)
        : null,
    createdAt: `${shiftDate(demoAsOfDate, -(index + 8))}T03:00:00.000Z`,
  };
});

export const seedPromises = [
  ...baseSeedPromises,
  ...generatedSeedPromises,
] as const;

const baseSeedDisputes = [
  {
    id: '90000000-0000-4000-8000-000000000001',
    organizationId: seedOrganizations[0].id,
    invoiceId: seedInvoices[4].id,
    category: DisputeCategory.WRONG_AMOUNT,
    details:
      'Customer requested reconciliation after a payment allocation was reversed.',
    status: DisputeStatus.OPEN,
    createdById: seedUsers[1].id,
    createdByRole: MembershipRole.OPERATOR,
    operationKey: '91000000-0000-4000-8000-000000000001',
    resolvedById: null,
    resolvedByRole: null,
    resolvedAt: null,
    resolutionNote: null,
    resolutionOperationKey: null,
    createdAt: `${shiftDate(demoAsOfDate, -11)}T03:00:00.000Z`,
  },
  {
    id: '90000000-0000-4000-8000-000000000002',
    organizationId: seedOrganizations[0].id,
    invoiceId: seedInvoices[1].id,
    category: DisputeCategory.MISSING_POD,
    details: 'Customer requested proof of delivery before approving payment.',
    status: DisputeStatus.RESOLVED,
    createdById: seedUsers[0].id,
    createdByRole: MembershipRole.OWNER,
    operationKey: '91000000-0000-4000-8000-000000000002',
    resolvedById: seedUsers[1].id,
    resolvedByRole: MembershipRole.OPERATOR,
    resolvedAt: `${shiftDate(demoAsOfDate, -10)}T04:00:00.000Z`,
    resolutionNote: 'Proof of delivery shared and acknowledged by AP.',
    resolutionOperationKey: '92000000-0000-4000-8000-000000000002',
    createdAt: `${shiftDate(demoAsOfDate, -12)}T03:00:00.000Z`,
  },
] as const;

const generatedSeedDisputes = Array.from({ length: 6 }, (_, index) => {
  const resolved = index >= 4;
  return {
    id: seedId('9', index + 101),
    organizationId: seedOrganizations[0].id,
    invoiceId: generatedSeedInvoices[index + 30]!.id,
    category: [
      DisputeCategory.MISSING_POD,
      DisputeCategory.WRONG_AMOUNT,
      DisputeCategory.ADMINISTRATIVE,
    ][index % 3]!,
    details: [
      'Customer needs proof of delivery before releasing payment.',
      'Customer requested a line-item amount reconciliation.',
      'Invoice is waiting for vendor master data correction.',
    ][index % 3]!,
    status: resolved ? DisputeStatus.RESOLVED : DisputeStatus.OPEN,
    createdById: seedUsers[index % 2]!.id,
    createdByRole:
      index % 2 === 0 ? MembershipRole.OWNER : MembershipRole.OPERATOR,
    operationKey: seedId('9', index + 201),
    resolvedById: resolved ? seedUsers[1].id : null,
    resolvedByRole: resolved ? MembershipRole.OPERATOR : null,
    resolvedAt: resolved
      ? `${shiftDate(demoAsOfDate, -1)}T04:00:00.000Z`
      : null,
    resolutionNote: resolved
      ? 'Synthetic exception cleared after supporting documents were matched.'
      : null,
    resolutionOperationKey: resolved ? seedId('9', index + 301) : null,
    createdAt: `${shiftDate(demoAsOfDate, -(index + 5))}T03:00:00.000Z`,
  };
});

export const seedDisputes = [
  ...baseSeedDisputes,
  ...generatedSeedDisputes,
] as const;

const baseSeedPayments = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    organizationId: seedOrganizations[0].id,
    debtorId: seedDebtors[0].id,
    paymentDate: shiftDate(demoAsOfDate, -13),
    amount: '50000000.00',
    payerReference: 'Opening balance seed',
    bankReference: 'SEED-PARTIAL-001',
    isOpeningBalance: true,
    createdById: seedUsers[0].id,
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    organizationId: seedOrganizations[0].id,
    debtorId: seedDebtors[0].id,
    paymentDate: shiftDate(demoAsOfDate, -99),
    amount: '50000000.00',
    payerReference: 'Opening balance seed',
    bankReference: 'SEED-PAID-001',
    isOpeningBalance: true,
    createdById: seedUsers[0].id,
  },
  {
    id: '40000000-0000-4000-8000-000000000003',
    organizationId: seedOrganizations[0].id,
    debtorId: seedDebtors[2].id,
    paymentDate: shiftDate(demoAsOfDate, -15),
    amount: '10000000.00',
    payerReference: 'Opening balance seed',
    bankReference: 'SEED-REVERSED-001',
    isOpeningBalance: true,
    createdById: seedUsers[0].id,
  },
] as const;

const generatedPaymentFixtures = generatedSeedInvoices.flatMap(
  (invoice, index) => {
    const fullyPaid = index % 10 === 0;
    const partiallyPaid = !fullyPaid && index % 6 === 0;
    if (!fullyPaid && !partiallyPaid) return [];
    const originalAmount = wholeMoney(invoice.originalAmount);
    const amount = fullyPaid
      ? originalAmount
      : Math.floor(originalAmount * 0.4);
    const paymentDate =
      index % 4 === 0
        ? shiftDate(demoAsOfDate, -(index % 6))
        : shiftDate(demoAsOfDate, -14 - (index % 10));
    return [{ invoice, index, amount: money(amount), paymentDate }];
  },
);

const generatedSeedPayments = generatedPaymentFixtures.map(
  (fixture, index) => ({
    id: seedId('4', index + 101),
    organizationId: seedOrganizations[0].id,
    debtorId: fixture.invoice.debtorId,
    paymentDate: fixture.paymentDate,
    amount: fixture.amount,
    payerReference: `Synthetic remittance ${String(index + 1).padStart(3, '0')}`,
    bankReference: `DEMO-BANK-${String(index + 1).padStart(3, '0')}`,
    isOpeningBalance: false,
    createdById: seedUsers[index % 2]!.id,
  }),
);

export const seedPayments = [
  ...baseSeedPayments,
  ...generatedSeedPayments,
] as const;

const baseSeedAllocations = [
  {
    id: '50000000-0000-4000-8000-000000000001',
    organizationId: seedOrganizations[0].id,
    paymentId: seedPayments[0].id,
    invoiceId: seedInvoices[0].id,
    amount: '50000000.00',
    allocationDate: shiftDate(demoAsOfDate, -13),
    createdById: seedUsers[0].id,
    reversedAt: null,
    reversalReason: null,
  },
  {
    id: '50000000-0000-4000-8000-000000000002',
    organizationId: seedOrganizations[0].id,
    paymentId: seedPayments[1].id,
    invoiceId: seedInvoices[3].id,
    amount: '50000000.00',
    allocationDate: shiftDate(demoAsOfDate, -99),
    createdById: seedUsers[0].id,
    reversedAt: null,
    reversalReason: null,
  },
  {
    id: '50000000-0000-4000-8000-000000000003',
    organizationId: seedOrganizations[0].id,
    paymentId: seedPayments[2].id,
    invoiceId: seedInvoices[4].id,
    amount: '10000000.00',
    allocationDate: shiftDate(demoAsOfDate, -15),
    createdById: seedUsers[0].id,
    reversedAt: `${shiftDate(demoAsOfDate, -14)}T03:00:00.000Z`,
    reversalReason: 'Synthetic correction for reconciliation coverage',
  },
] as const;

const generatedSeedAllocations = generatedPaymentFixtures.map(
  (fixture, index) => ({
    id: seedId('5', index + 101),
    organizationId: seedOrganizations[0].id,
    paymentId: generatedSeedPayments[index]!.id,
    invoiceId: fixture.invoice.id,
    amount: fixture.amount,
    allocationDate: fixture.paymentDate,
    createdById: seedUsers[index % 2]!.id,
    reversedAt: null,
    reversalReason: null,
  }),
);

export const seedAllocations = [
  ...baseSeedAllocations,
  ...generatedSeedAllocations,
] as const;

function validDemoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('DEMO_TODAY must use YYYY-MM-DD');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('DEMO_TODAY must be a valid calendar date');
  }
  return value;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${validDemoDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function seedId(prefix: string, sequence: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

function money(value: number): string {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Synthetic money must be a positive safe integer');
  }
  return `${value}.00`;
}

function wholeMoney(value: string): number {
  if (!/^\d+\.00$/.test(value)) {
    throw new Error(`Expected whole synthetic money, received ${value}`);
  }
  const amount = Number(value.slice(0, -3));
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Synthetic money is outside the safe range: ${value}`);
  }
  return amount;
}
