'use client';

import { RefreshCw, UserPlus } from 'lucide-react';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { ApiClientError } from '@/lib/api-client/http';
import type { MembershipRole } from '@/lib/auth/types';
import {
  inviteMember,
  listMembers,
  type Member,
  updateMember,
} from '@/lib/account-lifecycle/client';

interface MembersManagerProps {
  currentUserId: string;
}

export function MembersManager({ currentUserId }: MembersManagerProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMembers(await listMembers());
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(null);
    setNotice(null);
    setPendingId('invite');
    const form = new FormData(formElement);
    try {
      const member = await inviteMember({
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        role: String(form.get('role') ?? 'OPERATOR') as MembershipRole,
      });
      setMembers((current) => replaceMember(current, member));
      setNotice(`Invitation sent to ${member.email}.`);
      setInviteOpen(false);
      formElement.reset();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setPendingId(null);
    }
  }

  async function changeMember(
    member: Member,
    change: { role?: MembershipRole; isActive?: boolean },
  ) {
    setError(null);
    setNotice(null);
    setPendingId(member.id);
    try {
      const updated = await updateMember(member.id, change);
      setMembers((current) => replaceMember(current, updated));
      setNotice(`${updated.name}'s access was updated.`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setPendingId(null);
    }
  }

  async function resend(member: Member) {
    setError(null);
    setNotice(null);
    setPendingId(member.id);
    try {
      const updated = await inviteMember({
        email: member.email,
        name: member.name,
        role: member.role,
      });
      setMembers((current) => replaceMember(current, updated));
      setNotice(`A fresh invitation was sent to ${updated.email}.`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="members-manager">
      <div className="members-toolbar">
        <div>
          <h2>Workspace members</h2>
          <p>Invite operators and control access without sharing accounts.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => setInviteOpen((open) => !open)}
        >
          <UserPlus size={15} /> Invite member
        </button>
      </div>

      {inviteOpen && (
        <form className="member-invite-form" onSubmit={handleInvite}>
          <label className="field">
            Name
            <input
              className="input"
              name="name"
              minLength={2}
              maxLength={200}
              required
            />
          </label>
          <label className="field">
            Work email
            <input
              className="input"
              name="email"
              type="email"
              maxLength={320}
              required
            />
          </label>
          <label className="field">
            Role
            <select className="input" name="role" defaultValue="OPERATOR">
              <option value="OPERATOR">Operator</option>
              <option value="OWNER">Owner</option>
            </select>
          </label>
          <button
            className="button button-primary"
            type="submit"
            disabled={pendingId !== null}
          >
            {pendingId === 'invite' ? 'Sending…' : 'Send invitation'}
          </button>
        </form>
      )}

      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}

      <div className="member-list" aria-live="polite">
        {loading && <p className="member-empty">Loading members…</p>}
        {!loading && members.length === 0 && (
          <p className="member-empty">No members found.</p>
        )}
        {members.map((member) => {
          const self = member.userId === currentUserId;
          const pending = pendingId === member.id;
          return (
            <div className="member-row" key={member.id}>
              <span className="avatar avatar-blue">
                {initials(member.name)}
              </span>
              <div className="member-identity">
                <strong>
                  {member.name}
                  {self ? ' · You' : ''}
                </strong>
                <span>{member.email}</span>
              </div>
              <span
                className={`member-status member-status-${member.status.toLowerCase()}`}
              >
                {member.status.toLowerCase()}
              </span>
              {member.status === 'PENDING' ? (
                <button
                  className="control-button"
                  type="button"
                  onClick={() => void resend(member)}
                  disabled={pending}
                >
                  <RefreshCw size={14} /> {pending ? 'Sending…' : 'Resend'}
                </button>
              ) : (
                <>
                  <select
                    className="member-select"
                    aria-label={`Role for ${member.name}`}
                    value={member.role}
                    disabled={self || pending}
                    onChange={(event) =>
                      void changeMember(member, {
                        role: event.target.value as MembershipRole,
                      })
                    }
                  >
                    <option value="OWNER">Owner</option>
                    <option value="OPERATOR">Operator</option>
                  </select>
                  <button
                    className="control-button"
                    type="button"
                    disabled={self || pending}
                    onClick={() =>
                      void changeMember(member, {
                        isActive: member.status !== 'ACTIVE',
                      })
                    }
                  >
                    {pending
                      ? 'Saving…'
                      : member.status === 'ACTIVE'
                        ? 'Deactivate'
                        : 'Reactivate'}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function replaceMember(members: Member[], next: Member): Member[] {
  const exists = members.some((member) => member.id === next.id);
  return exists
    ? members.map((member) => (member.id === next.id ? next : member))
    : [...members, next];
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function messageFor(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : 'Unable to reach Arus. Please try again.';
}
