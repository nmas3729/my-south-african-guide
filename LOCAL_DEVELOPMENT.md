# Local Development

## Prerequisites

- Node.js 22 LTS or newer supported by the installed Next.js version
- npm
- Docker Engine
- Docker Compose

## Environment variables

Copy `.env.example` to `.env.local` and set local values. This repository includes a local development `.env.local` for the Docker database; it is ignored by Git and must never be committed.

Required for Prisma:

- `DATABASE_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `AUTH_SESSION_SECRET`

Optional public-site variables:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_WHATSAPP_NUMBER`
- `NEXT_PUBLIC_CONTACT_EMAIL`

`ADMIN_BOOTSTRAP_SECRET` is optional and must only be configured for a controlled development or administrative bootstrap operation. Never expose it to the browser or commit it.

## Start PostgreSQL

```bash
npm run db:up
docker compose ps
```

The PostgreSQL service listens on `localhost:5432` and stores data in the named Docker volume `msag_postgres_data`.

## Apply migrations and generate Prisma Client

```bash
npm run db:generate
npm run db:migrate:deploy
npm run db:check
```

Use the development migration command when changing the schema locally:

```bash
npm run db:migrate -- --name describe-your-change
npm run db:generate
```

Do not use `prisma db push` for the normal workflow. Production should apply committed migrations with:

```bash
npx prisma migrate deploy
```

## Start Next.js

```bash
npm run dev
```

Open http://localhost:3000.

## Stop PostgreSQL

```bash
npm run db:down
```

This stops and removes the container but keeps the named volume and local database data.

## Safely reset the local database

This permanently removes local database data. Confirm that no local data is needed before running it:

```bash
docker compose down -v
npm run db:up
npm run db:migrate:deploy
npm run db:check
```

Never run the volume-removal command against production infrastructure.

## Inspect the database

```bash
npm run db:studio
```

## Coolify later

GitHub will contain source code, the Prisma schema, committed migrations, Docker configuration, and documentation. Coolify will provide the production environment variables and PostgreSQL connection. Production must use a separate database and must not reuse `.env.local` or local Docker data.

The future production process is:

1. Build the Next.js Docker image from GitHub.
2. Configure `DATABASE_URL` and application secrets in Coolify.
3. Run `npx prisma migrate deploy` against the Coolify PostgreSQL database.
4. Start the image with `node server.js`.

Cloudflare is DNS-only at this stage. Resend is reserved for a later transactional email integration. No production services are connected by this project setup.

## Secrets

Keep local secrets in `.env.local`. Configure production secrets only in Coolify. Do not commit database credentials, API keys, email provider keys, or `.env.local` to GitHub.
