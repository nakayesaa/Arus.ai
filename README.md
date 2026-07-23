# Arus.ai

Internal, multi-tenant workspace untuk membantu operator mengelola account receivable (AR): mengimpor invoice, menghitung aging, menentukan prioritas follow-up, mencatat komunikasi, promise-to-pay, dispute, payment, dan laporan mingguan.

Produk ini dibangun sebagai managed AR operations system untuk client nyata. Lihat [commercial purpose](purpose.md) dan [system design](docs/system-design.md) sebelum mengubah scope atau architecture.

## Current foundation

- npm/TypeScript monorepo;
- Next.js internal web workspace;
- Express API dengan request ID, structured logs, safe errors, CORS, dan security headers;
- pure domain package dengan Vitest;
- Prisma/PostgreSQL identity dan tenant foundation;
- secure invitations, password recovery, member roles, and session revocation;
- deterministic 15-customer/~80-invoice demo portfolio plus a boundary tenant;
- lint, format, typecheck, test, build, migration, dan local database scripts.

## Requirements

- Node.js sesuai [`.nvmrc`](.nvmrc);
- npm sesuai `packageManager` di `package.json`;
- PostgreSQL connection, either local Docker or a managed Supabase project.

## First setup

```bash
nvm install
nvm use
cp .env.example .env
npm ci
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

Run `npm run db:up` before migrations only when using local Docker. With Supabase,
configure its pooled and direct PostgreSQL URLs in `.env` and skip Docker.

Ganti `SESSION_SECRET` dan `DEMO_SEED_PASSWORD` di `.env` sebelum menjalankan seed. Demo seed memakai synthetic data, memuat dua organization untuk tenant-boundary testing, dan menolak berjalan saat `NODE_ENV=production`.

Local invitation and reset emails are written as private JSON files under
`.local-emails/`. Production refuses this mode and requires backend-only Resend
configuration; provider keys are never exposed to the web bundle.

To send real email, create a Resend API key and configure only the backend `.env`:

```text
EMAIL_DELIVERY_MODE=resend
EMAIL_FROM=Arus <accounts@your-verified-domain.com>
RESEND_API_KEY=re_your_private_key
```

Restart `npm run dev` after changing these values. Invitation recipients open a
one-time `/welcome` link, choose their display name and password, and receive an
authenticated session immediately after activation.

Invitation and reset credentials are carried in URL fragments so they never
reach web/API request logs, then removed from the address bar immediately after
the browser reads them. Keep Resend open and click tracking disabled for the
transactional auth domain so the provider does not rewrite sensitive links.

Setelah startup:

- web: `http://localhost:3000`;
- API: `http://localhost:4000`;
- health: `http://localhost:4000/health`.

## Daily commands

| Command                     | Purpose                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `npm run dev`               | Menjalankan API dan web menggunakan root `.env`                 |
| `npm run build`             | Generate Prisma Client lalu production-build seluruh workspace  |
| `npm run lint`              | Menjalankan ESLint                                              |
| `npm run format:check`      | Memeriksa format tanpa mengubah file                            |
| `npm run typecheck`         | Generate Prisma Client dan typecheck seluruh workspace/seed     |
| `npm run test:run`          | Menjalankan seluruh test satu kali                              |
| `npm run db:up`             | Menyalakan local PostgreSQL                                     |
| `npm run db:down`           | Menghentikan local services tanpa menghapus volume              |
| `npm run db:migrate`        | Membuat/menerapkan development migration                        |
| `npm run db:migrate:deploy` | Menerapkan migration yang sudah committed                       |
| `npm run db:seed`           | Menjalankan explicit synthetic demo seed                        |
| `npm run demo:reset`        | Reset known demo tenants, reseed, lalu reconcile hasilnya       |
| `npm run demo:verify`       | Read-only verification untuk count dan financial reconciliation |
| `npm run db:studio`         | Membuka Prisma Studio untuk local development                   |

`npm run demo:reset` menghapus operational data hanya dari dua tenant
synthetic dengan ID yang dikenal, lalu membuat ulang state demo. Jangan jalankan
saat ingin mempertahankan perubahan manual di demo workspace. Gunakan
`DEMO_TODAY=YYYY-MM-DD npm run demo:reset` untuk menggeser portfolio generated
ke tanggal demo yang dipilih.

## Repository map

```text
apps/api/       Express API and HTTP boundaries
apps/web/       Next.js internal workspace
packages/domain Pure business rules
prisma/         Schema, migrations, and synthetic seed
tests/          Shared fixtures and end-to-end tests
scripts/        Operational scripts
docs/           Authoritative product and engineering contracts
```

`tests/` dan `scripts/` akan terisi sepanjang P0 implementation. Jangan menaruh business calculations di web atau controller; formula authoritative berada di [domain rules](docs/03-domain-rules.md) dan diimplementasikan sebagai pure functions di `packages/domain`.

## Safety notes

- Jangan commit `.env`, database dumps, credentials, raw client CSV, atau production data.
- Tenant selalu berasal dari authenticated session, bukan `organizationId` milik request.
- Jangan mengubah outstanding balance secara langsung; financial truth berasal dari invoice dan non-reversed allocations.
- Migration production dijalankan sebagai controlled release step, bukan test biasa.
- Real client data tidak boleh dipakai sebelum tenant-isolation blockers dan restore test lulus.
