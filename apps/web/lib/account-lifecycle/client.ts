import { apiRequest } from '@/lib/api-client/http';
import type {
  AuthSession,
  DataEnvelope,
  MembershipRole,
} from '@/lib/auth/types';

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
  role: MembershipRole;
}): Promise<{ member: Member; delivery: 'EMAIL' | 'LOCAL_FILE' }> {
  const response = await apiRequest<
    DataEnvelope<Member> & { meta: { delivery: 'EMAIL' | 'LOCAL_FILE' } }
  >('/api/members', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { member: response.data, delivery: response.meta.delivery };
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
  name: string,
  password: string,
): Promise<AuthSession> {
  const response = await apiRequest<DataEnvelope<AuthSession>>(
    '/api/auth/invitations/accept',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name, password }),
    },
  );
  return response.data;
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
  path: '/api/auth/password-reset/complete',
  body: { token: string; password: string },
): Promise<void> {
  await apiRequest<void>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
