import type { Metadata } from 'next';
import {
  ArrowUp,
  Database,
  FileUp,
  Paperclip,
  Plus,
  Sparkles,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Chat' };

const prompts = [
  'Prioritize today’s overdue accounts',
  'Draft a broken-promise follow-up',
  'Summarize high-value debtors',
] as const;

export default function ChatPage() {
  return (
    <div className="chat-page">
      <PageHeader
        title="Chat"
        eyebrow="New conversation"
        action={
          <button className="chat-header-action" type="button">
            <Plus size={15} /> New chat
          </button>
        }
      />

      <section className="chat-stage" aria-labelledby="chat-title">
        <div className="chat-intro">
          <span className="chat-intro-icon" aria-hidden="true">
            <Sparkles size={17} />
          </span>
          <p>Arus collection copilot</p>
          <h2 id="chat-title">what do you want to collect today?</h2>
          <span>
            Ask about your receivables, decide who to contact, or prepare the
            next follow-up.
          </span>
        </div>

        <form className="chat-composer">
          <label className="visually-hidden" htmlFor="chat-message">
            Message Arus
          </label>
          <textarea
            id="chat-message"
            name="message"
            rows={3}
            placeholder="Ask Arus about your collection work..."
          />
          <div className="chat-composer-footer">
            <div className="chat-tools">
              <button
                className="chat-tool-button"
                type="button"
                aria-label="Attach file"
              >
                <Paperclip size={16} />
              </button>
              <button
                className="chat-tool-button"
                type="button"
                aria-label="Import context"
              >
                <FileUp size={16} />
              </button>
              <span className="chat-context">
                <Database size={13} /> Receivables workspace
              </span>
            </div>
            <button
              className="chat-send-button"
              type="submit"
              aria-label="Send message"
            >
              <ArrowUp size={19} strokeWidth={2.3} />
            </button>
          </div>
        </form>

        <div className="chat-prompts" aria-label="Suggested prompts">
          {prompts.map((prompt) => (
            <button type="button" key={prompt}>
              {prompt}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
