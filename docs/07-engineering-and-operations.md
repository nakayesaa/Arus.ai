# Engineering and operations

Status: authoritative untuk structure, security, CI/CD, deployment, logging, monitoring, backup, dan recovery.

## Architecture

Gunakan TypeScript monorepo dengan satu API dan satu web app. Hindari microservices dan abstraction yang belum dibutuhkan.

```text
/
├── README.md
├── docs/
├── package.json              # workspace scripts
├── tsconfig.base.json
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── repositories/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   └── server.ts
│   │   └── package.json
│   └── web/
│       ├── app/
│       ├── components/
│       ├── lib/api-client/
│       └── package.json
├── packages/
│   └── domain/               # pure money/date/queue rules and shared types
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── fixtures/
│   └── e2e/
└── scripts/
    ├── backup.sh
    └── smoke-test.ts
```

Layer responsibilities:

- Controllers: HTTP parsing, capability check handoff, response mapping.
- Services: transaction orchestration dan domain workflow.
- Repositories: tenant-scoped Prisma queries; tidak menerima untrusted org ID.
- Domain package: pure functions untuk aging, balance, promise, queue, dan metrics.
- API client: typed request wrappers; tidak berisi business rules.

## Environment model

- **Local:** local PostgreSQL, demo seed, `.env.local` yang tidak di-commit.
- **Preview/staging:** isolated database atau schema; synthetic data only.
- **Production:** client/pilot data, least-privilege credentials, strong secrets.

Minimal variables:

```text
DATABASE_URL
SESSION_SECRET
APP_ORIGIN
API_ORIGIN
NODE_ENV
SENTRY_DSN              # optional
DEMO_TODAY              # demo/test only; forbidden in production client orgs
```

Sediakan `.env.example` tanpa secrets.

## Security baseline

### Before public demo

- HTTPS production.
- Bcrypt cost 12 dan secure HTTP-only session cookie.
- Login rate limiting dan generic invalid-credential response.
- Schema validation untuk params/body/query.
- CSV type/size/row limits.
- CORS hanya untuk configured frontend origin.
- No stack trace atau secret di response/log.
- Dependency and secret scanning di CI.
- Security headers dan safe content rendering.

### Before real client data

- Automated tenant-isolation suite lulus.
- Strong rotated production secrets dan separate production credentials.
- Session revocation/deactivated-user behavior diuji.
- Audit events aktif untuk seluruh mutasi P0.
- Backup terenkripsi dan restore test lulus.
- Data retention/deletion procedure disepakati.
- Access ke production dibatasi dan tercatat.
- Client consent/agreement lengkap.

### Later hardening

- MFA, more granular roles, penetration test, formal OWASP review, and stronger rate limiting.

Prisma mengurangi SQL injection risk tetapi tidak menggantikan input validation, authorization, XSS protection, dan transaction correctness.

## CI pipeline

Pada push/PR:

1. Install dependencies menggunakan lockfile (`npm ci`).
2. Format/lint.
3. Typecheck.
4. Unit tests.
5. Integration tests dengan disposable PostgreSQL.
6. Build API dan web.
7. Optional Playwright smoke test pada preview environment.

Migration validation berjalan terhadap disposable database. Jangan menjalankan `prisma migrate deploy` ke production sebagai langkah test biasa.

Merge ke `main` dapat memicu production deployment setelah CI hijau. Untuk solo founder, mandatory external code review bukan requirement realistis; gunakan protected main, passing checks, dan explicit self-review checklist.

Secrets disimpan pada deployment/GitHub secret store dan tidak tersedia pada untrusted fork builds.

## Deployment

Requirements lebih penting daripada provider:

- Web host mendukung Next.js dan HTTPS.
- API host mendukung long-running Node atau compatible serverless adapter.
- Managed PostgreSQL menyediakan TLS, restricted credentials, metrics, dan export/backup path.
- Web dan API mempunyai stable production origins.
- Migration dijalankan satu kali sebagai controlled release step sebelum application switch.
- `/health` memisahkan liveness dari dependency readiness bila diperlukan.

Vercel, Railway/Fly/Render, Supabase, dan Neon adalah kandidat, bukan keputusan permanen. Pricing, free-tier limits, region, sleep behavior, dan backup guarantees berubah dari waktu ke waktu dan wajib diverifikasi saat Day 1/12. Jangan memakai klaim biaya/provider dari dokumen historis sebagai fakta deployment.

## Release and rollback

1. CI menghasilkan immutable build/deployment.
2. Backup diambil sebelum destructive/irreversible migration.
3. Migration dirancang backward-compatible bila mungkin.
4. Deploy API/web.
5. Jalankan smoke tests: health, login, dashboard, tenant boundary, dan basic read.
6. Jika code regression, rollback application ke release sebelumnya.
7. Database rollback dilakukan hanya dengan tested recovery plan; jangan mengandalkan ad-hoc down migration pada client data.

## Logging and monitoring

Structured JSON log minimal memuat timestamp, level, service, environment, request ID, route template, status, duration, actor ID jika aman, dan organization ID internal. Jangan mencatat password, session token, full auth header, bank secret, atau raw CSV contents.

Levels:

- `info`: request summary dan completed business operations.
- `warn`: rejected validation, duplicate import, recoverable dependency issue.
- `error`: unexpected exception/failed transaction.

Request ID dibuat/diteruskan per request dan dikembalikan sebagai `X-Request-ID`.

Minimum monitoring:

- uptime check pada health endpoint;
- error rate dan latency dari host logs;
- database connection/storage metrics;
- alert untuk repeated 5xx, database unavailable, dan import transaction failures;
- optional Sentry-compatible exception tracking.

Audit log bukan pengganti application log, dan application log bukan audit trail.

## Backup and recovery

- Gunakan provider-native backup bila tersedia, tetapi verifikasi retention dan restore entitlement pada plan yang dipakai.
- Ambil encrypted logical dump berkala ke private object storage berbeda dari primary database.
- Jangan menyimpan database dump di Git, Git LFS, atau shared personal Drive tanpa encryption/access control.
- Migration history tetap di repository.
- Test restore ke isolated database sebelum real client data dan setelah perubahan besar.
- Bandingkan organization/debtor/invoice/payment/allocation counts serta sampled balances setelah restore.

Soft delete dapat dipakai untuk Debtor/Invoice, tetapi financial activity menggunakan reversal/correction event, bukan silent delete.

Import rollback P1 hanya boleh berjalan jika tidak ada downstream manual activity/allocation; selain itu gunakan explicit correction.

## Incident runbook

1. Triage scope: availability, code regression, security, atau data integrity.
2. Hentikan writes bila data integrity terancam.
3. Catat incident time, affected organizations, request IDs, dan last good release.
4. Rollback code jika aman; restore data hanya dari verified backup dan dengan reconciliation.
5. Jalankan smoke plus financial/tenant checks.
6. Beri tahu affected pilot owner sesuai agreement.
7. Dokumentasikan root cause dan preventive action.

## Operational acceptance

- Fresh environment dapat setup dari README + migrations + seed.
- CI hijau dari clean checkout.
- Production secrets tidak ada di repo/build output.
- Health, structured logs, request IDs, dan error tracking dapat dilihat.
- Backup dapat direstore; bukan sekadar berhasil dibuat.
- Provider assumptions dan recurring costs dicatat setelah deployment decision aktual.
