import { apiRequest } from '@/lib/api-client/http';
import type { DataEnvelope, MembershipRole } from '@/lib/auth/types';

export interface Member {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: MembershipRole;
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE';
  invitedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export async function listMembers(): Promise<Member[]> {
  const response = await apiRequest<DataEnvelope<Member[]>>('/api/members');
  return response.data;
}

export async function inviteMember(input: {
  email: string;
  name: string;
  role: MembershipRole;
}): Promise<Member> {
  const response = await apiRequest<DataEnvelope<Member>>('/api/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function updateMember(
  membershipId: string,
  input: { role?: MembershipRole; isActive?: boolean },
): Promise<Member> {
  const response = await apiRequest<DataEnvelope<Member>>(
    `/api/members/${membershipId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function acceptInvitation(
  token: string,
  password: string,
): Promise<void> {
  await accountAction('/api/auth/invitations/accept', {
    token,
    password,
  });
}

export async function requestPasswordReset(email: string): Promise<string> {
  const response = await apiRequest<DataEnvelope<{ message: string }>>(
    '/api/auth/password-reset/request',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    },
  );
  return response.data.message;
}

export async function completePasswordReset(
  token: string,
  password: string,
): Promise<void> {
  await accountAction('/api/auth/password-reset/complete', {
    token,
    password,
  });
}

async function accountAction(
  path: '/api/auth/invitations/accept' | '/api/auth/password-reset/complete',
  body: { token: string; password: string },
): Promise<void> {
  await apiRequest<void>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
