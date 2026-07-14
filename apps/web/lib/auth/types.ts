export type MembershipRole = 'OWNER' | 'OPERATOR';

export interface AuthSession {
  user: {
    id: string;
    email: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
    timezone: string;
  };
  role: MembershipRole;
  expiresAt?: string;
}

export interface DataEnvelope<T> {
  data: T;
}
