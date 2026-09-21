# Authentication Foundation

Authentication is server-only and uses one `User` identity with `TRAVELLER`, `GUIDE`, and `ADMIN` roles.

## Pages and API endpoints

Public pages:

- `/login`
- `/register`
- `/register/guide`
- `/verify-email?token=...`
- `/forgot-password`
- `/reset-password?token=...`

The protected `/account` page displays safe session-backed account information only. It is server-rendered and redirects anonymous visitors to `/login?returnTo=/account`.

The UI uses these route handlers:

- `GET /api/auth/csrf`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/verify-email`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`

The browser does not store session, verification, or reset tokens in local storage, session storage, or IndexedDB.

## Sessions

Sessions are signed JWTs in the `msag_session` HTTP-only cookie. The payload contains only the user ID, role, session revision, issuer, audience, and standard timestamps. Every request reloads the user from PostgreSQL and rejects disabled users, changed roles, or stale `sessionVersion` values.

Password reset increments `User.sessionVersion`, invalidating existing sessions. The same increment should be used for future security-sensitive account changes or explicit account security actions.

## CSRF

State-changing route handlers must call the shared `protectMutation()` helper before doing work. Clients first request `GET /api/auth/csrf`, retain the returned token, and send it in the `x-csrf-token` header on the same-origin mutation. The value is also stored in the `msag_csrf` cookie; the server compares the header and cookie in constant time.

Future server actions must call `assertCsrfToken()` before authenticated mutations. SameSite cookies are an additional browser control, not a replacement for this check.

## Rate limiting

Authentication handlers use the shared in-memory limiter for login, registration, reset requests, and verification attempts. It is suitable for local development and a single process only. Coolify production deployments with more than one instance must replace the backing store with a shared provider such as Redis or a database-backed limiter.

## Email tokens

Verification and reset tokens are generated with a cryptographically secure random generator. Only SHA-256 hashes are stored in PostgreSQL. Raw values are passed only to the deferred email abstraction and are never logged or returned by API responses. Tokens expire and are atomically consumed once.

The email abstraction currently performs no delivery. A Resend adapter can later implement `TransactionalEmailService` without changing token or account workflows.

## Admin bootstrap

There is no public admin registration. `createAdminUser()` is isolated in `src/server/auth/admin-bootstrap.ts` and requires `ADMIN_BOOTSTRAP_SECRET`. Use it only from a controlled server-side development or administrative command. Never expose the secret through a route, client component, logs, GitHub, or `.env.example` with a real value. Production should set it temporarily in Coolify, run the controlled bootstrap operation, and remove or rotate it immediately.

## Local testing

```bash
npm run test:auth
npx tsc --noEmit
npm run lint
npm run build
```

For live auth smoke tests, start PostgreSQL and Next.js, request `/api/auth/csrf`, then send the returned value as the `x-csrf-token` header on every mutation. Use a disposable local email address for registration; no production email provider is connected yet.
