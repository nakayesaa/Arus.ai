# Arus.ai

Internal, multi-tenant workspace untuk membantu operator mengelola account receivable (AR): mengimpor invoice, menghitung aging, menentukan prioritas follow-up, mencatat komunikasi, promise-to-pay, dispute, payment, dan laporan mingguan.

Produk ini dibangun sebagai managed AR operations system untuk client nyata. Lihat [commercial purpose](purpose.md) dan [system design](docs/system-design.md) sebelum mengubah scope atau architecture.

## Current foundation

- npm/TypeScript monorepo;
- Next.js internal web workspace;
- Express API dengan request ID, structured logs, safe errors, CORS, dan security headers;
- pure domain package dengan Vitest;
- Prisma/PostgreSQL identity dan tenant foundation;
- deterministic two-organization demo seed;
- lint, format, typecheck, test, build, migration, dan local database scripts.

## Requirements

- Node.js sesuai [`.nvmrc`](.nvmrc);
- npm sesuai `packageManager` di `package.json`;
- Docker dengan Compose plugin untuk local PostgreSQL.

## First setup

```bash
nvm install
nvm use
cp .env.example .env
npm ci
npm run db:up
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

Ganti `SESSION_SECRET` dan `DEMO_SEED_PASSWORD` di `.env` sebelum menjalankan seed. Demo seed memakai synthetic data, memuat dua organization untuk tenant-boundary testing, dan menolak berjalan saat `NODE_ENV=production`.

Setelah startup:

- web: `http://localhost:3000`;
- API: `http://localhost:4000`;
- health: `http://localhost:4000/health`.

## Daily commands

| Command                     | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `npm run dev`               | Menjalankan API dan web menggunakan root `.env`                |
| `npm run build`             | Generate Prisma Client lalu production-build seluruh workspace |
| `npm run lint`              | Menjalankan ESLint                                             |
| `npm run format:check`      | Memeriksa format tanpa mengubah file                           |
| `npm run typecheck`         | Generate Prisma Client dan typecheck seluruh workspace/seed    |
| `npm run test:run`          | Menjalankan seluruh test satu kali                             |
| `npm run db:up`             | Menyalakan local PostgreSQL                                    |
| `npm run db:down`           | Menghentikan local services tanpa menghapus volume             |
| `npm run db:migrate`        | Membuat/menerapkan development migration                       |
| `npm run db:migrate:deploy` | Menerapkan migration yang sudah committed                      |
| `npm run db:seed`           | Menjalankan explicit synthetic demo seed                       |
| `npm run db:studio`         | Membuka Prisma Studio untuk local development                  |

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
