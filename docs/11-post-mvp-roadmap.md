# Post-MVP roadmap

Status: authoritative untuk work yang sengaja ditunda. Item hanya dipromosikan setelah feedback/metrics menunjukkan kebutuhan.

## Promotion criteria

Sebelum memulai item roadmap, jawab:

- Pilot pain point apa yang dibuktikan?
- Berapa waktu operator/client yang akan dihemat?
- Apakah perubahan meningkatkan collection outcome atau sales conversion?
- Data, security, provider, dan support burden apa yang ditambah?
- P0 reliability work apa yang masih terbuka?

Tidak ada item roadmap yang otomatis menjadi prioritas hanya karena pernah disebut di dokumen historis.

## Days 15–30 — stabilize from pilot evidence

- Interview 3–5 target users/pilot stakeholders.
- Fix usability and reconciliation gaps.
- Improve import feedback, exact debtor matching, and controlled invoice correction.
- Add pagination/performance only if actual volumes require it.
- Add password reset/MFA and stronger security controls before broader access.
- Implement audit-log UI and exports if operations need them.
- Validate pricing and service packaging from pilot workload/outcomes.
- Consider read-only client view only if repeatedly requested.

## Days 31–60 — reduce operator effort

- Reminder text drafting and click-to-WhatsApp with human review.
- Approved outbound email flow with preview, consent, rate limits, and audit.
- Multiple debtor contacts and better dispute ownership.
- Unallocated payment and multi-invoice allocation with reconciliation UX.
- PDF/export generation and scheduled internal reports.
- First accounting integration only for an actual pilot system with API access.
- Operator guide and onboarding material.

## Days 61–90 — decide service vs product direction

- Measure repeatability across clients and data formats.
- Build guided client onboarding/import only if support pattern is stable.
- Expand read-only client portal based on adoption evidence.
- Add ROI reporting tied to reconciled collections.
- Train additional operator if managed-service workload justifies it.
- Decide whether to remain service-led, become SaaS, or keep a hybrid model.

## Later/conditional bets

- Official WhatsApp API after consent, template, cost, and volume are proven.
- OCR/document extraction only when missing-document work is frequent and source documents are available.
- Cash forecasting only after enough clean payment history.
- Debtor risk scoring only with appropriate data, explainability, and non-discriminatory use review.
- Payment/financing partnerships only after legal, regulatory, and business review.
- Generic workflow builder only if multiple proven workflows cannot be handled by configuration.

## Ongoing guardrails

- Continue exact money reconciliation and tenant-isolation regression tests.
- Add automation only when a human approval boundary remains clear.
- Revisit data retention, access control, backup, and incident response with every scale step.
- Avoid treating provider free tiers, external APIs, or compliance assumptions as permanent.
- Use actual pilot outcomes, not feature parity with larger SaaS products, to set priority.
