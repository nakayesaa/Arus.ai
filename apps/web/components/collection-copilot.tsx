'use client';

import {
  Bot,
  CircleDollarSign,
  Clock3,
  Mail,
  Minus,
  Paperclip,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';

export function CollectionCopilot() {
  const [open, setOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = prompt.trim();

    if (!request) return;

    setNotice(`Request queued for review: “${request}”`);
    setPrompt('');
  }

  return (
    <>
      <aside
        className={`collection-copilot ${collapsed ? 'collection-copilot-collapsed' : ''} ${open ? '' : 'collection-copilot-closed'}`}
        aria-label="Arus Collection Copilot"
        aria-hidden={!open}
      >
        <header className="copilot-header">
          <span className="copilot-brand">
            <span className="copilot-mark" aria-hidden="true">
              <Sparkles size={14} />
            </span>
            <strong>Arus Collection Copilot</strong>
            <small>Case-aware</small>
          </span>
          <span className="copilot-window-actions">
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              aria-label={collapsed ? 'Expand copilot' : 'Minimize copilot'}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close copilot"
            >
              <X size={14} />
            </button>
          </span>
        </header>

        <div
          className="copilot-collapse-region"
          data-open={!collapsed}
          aria-hidden={collapsed}
        >
          <div className="copilot-collapse-region-inner">
            <div className="copilot-content">
              <p className="copilot-attribution">
                <Bot size={13} aria-hidden="true" /> Investigated this case
                using invoice, communication, promise, and payment history.
              </p>
              <h2>Broken promise requires a controlled escalation</h2>
              <p>
                No payment was matched after the promised deadline. The debtor
                replied yesterday, so a firm reminder is appropriate before
                escalating to the client owner.
              </p>

              <div className="copilot-evidence">
                <span>
                  <Clock3 size={13} /> Promise missed by 21 hours
                </span>
                <span>
                  <CircleDollarSign size={13} /> No matching payment detected
                </span>
                <span>
                  <Mail size={13} /> Last customer contact was acknowledged
                </span>
              </div>

              <section className="copilot-recommendation">
                <header>
                  <span>Recommended next action</span>
                  <strong>Human approval required</strong>
                </header>
                <p>
                  Send a WhatsApp reminder requesting payment confirmation by
                  14:00, then escalate to the client owner if there is no reply.
                </p>
                <div>
                  <Link
                    className="copilot-primary-action"
                    href="/collection-queue"
                  >
                    Review draft
                  </Link>
                  <Link
                    className="copilot-secondary-action"
                    href="/collection-queue"
                  >
                    Open evidence
                  </Link>
                </div>
              </section>
            </div>

            <form className="copilot-composer" onSubmit={submitRequest}>
              <label htmlFor="copilot-prompt">Ask about this account</label>
              <div>
                <button
                  type="button"
                  disabled
                  aria-label="Attachments are not available yet"
                >
                  <Paperclip size={14} />
                </button>
                <input
                  id="copilot-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Investigate, summarize, or draft an action…"
                />
                <button
                  type="submit"
                  disabled={!prompt.trim()}
                  aria-label="Send request to copilot"
                >
                  <Send size={14} />
                </button>
              </div>
              {notice && <p role="status">{notice}</p>}
            </form>
          </div>
        </div>
      </aside>

      <button
        className={`copilot-reopen ${open ? 'copilot-reopen-hidden' : ''}`}
        type="button"
        onClick={() => setOpen(true)}
        aria-hidden={open}
        tabIndex={open ? -1 : undefined}
      >
        <Sparkles size={14} /> Open Collection Copilot
      </button>
    </>
  );
}
