import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Logger } from 'pino';

import type { Environment } from '../config/env.js';

export type AccountEmailKind = 'INVITATION' | 'PASSWORD_RESET';

export interface AccountEmail {
  kind: AccountEmailKind;
  to: string;
  recipientName: string;
  actionUrl: string;
  expiresAt: Date;
}

export interface AccountEmailSender {
  send(message: AccountEmail): Promise<void>;
}

export function createAccountEmailSender(
  environment: Pick<
    Environment,
    'EMAIL_DELIVERY_MODE' | 'EMAIL_FROM' | 'RESEND_API_KEY'
  >,
  logger: Pick<Logger, 'info'>,
): AccountEmailSender {
  if (environment.EMAIL_DELIVERY_MODE === 'resend') {
    if (!environment.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is required for Resend email delivery');
    }

    return new ResendAccountEmailSender(
      environment.EMAIL_FROM,
      environment.RESEND_API_KEY,
    );
  }

  const projectRoot = process.env.INIT_CWD ?? process.cwd();
  return new FileAccountEmailSender(
    path.resolve(projectRoot, '.local-emails'),
    logger,
  );
}

class FileAccountEmailSender implements AccountEmailSender {
  constructor(
    private readonly directory: string,
    private readonly logger: Pick<Logger, 'info'>,
  ) {}

  async send(message: AccountEmail): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const filename = `${Date.now()}-${randomUUID()}.json`;
    const destination = path.join(this.directory, filename);
    await writeFile(
      destination,
      `${JSON.stringify(serializeMessage(message), null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    this.logger.info(
      { emailKind: message.kind, filename },
      'Development account email written to local inbox',
    );
  }
}

class ResendAccountEmailSender implements AccountEmailSender {
  constructor(
    private readonly from: string,
    private readonly apiKey: string,
  ) {}

  async send(message: AccountEmail): Promise<void> {
    const content = contentFor(message);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Email provider rejected request (${response.status})`);
    }
  }
}

function serializeMessage(message: AccountEmail) {
  const content = contentFor(message);
  return {
    kind: message.kind,
    to: message.to,
    subject: content.subject,
    text: content.text,
    actionUrl: message.actionUrl,
    expiresAt: message.expiresAt.toISOString(),
  };
}

function contentFor(message: AccountEmail): {
  subject: string;
  text: string;
  html: string;
} {
  const invitation = message.kind === 'INVITATION';
  const subject = invitation
    ? 'You are invited to Arus'
    : 'Reset your Arus password';
  const action = invitation
    ? 'Set up your Arus account'
    : 'Reset your password';
  const safeName = escapeHtml(message.recipientName);
  const safeUrl = escapeHtml(message.actionUrl);
  const expiry = message.expiresAt.toISOString();
  const text = `Hi ${message.recipientName},\n\n${action}: ${message.actionUrl}\n\nThis one-time link expires at ${expiry}. If you did not expect this email, you can ignore it.`;

  return {
    subject,
    text,
    html: `<p>Hi ${safeName},</p><p><a href="${safeUrl}">${action}</a></p><p>This one-time link expires at ${expiry}. If you did not expect this email, you can ignore it.</p>`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character] ?? character,
  );
}
