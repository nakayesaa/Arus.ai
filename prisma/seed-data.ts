import { MembershipRole } from '../apps/api/src/generated/prisma/enums.js';

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
    name: 'Demo Owner',
    organizationId: seedOrganizations[0].id,
    role: MembershipRole.OWNER,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    email: 'operator@demo.arus.local',
    name: 'Demo Operator',
    organizationId: seedOrganizations[0].id,
    role: MembershipRole.OPERATOR,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    email: 'owner@boundary.arus.local',
    name: 'Boundary Owner',
    organizationId: seedOrganizations[1].id,
    role: MembershipRole.OWNER,
  },
] as const;
