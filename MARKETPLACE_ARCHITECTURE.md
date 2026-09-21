# Marketplace architecture

## Boundary

UI
 ↓
Route Handler / Server Action
 ↓
Domain Service
 ↓
Prisma
 ↓
PostgreSQL

## Public services

Public services are safe read-only operations for published marketplace data. They are used by public pages and public GET routes and intentionally exclude unpublished records, unverified guides, inactive guides, and private verification metadata.

- `listPublishedDestinations()`
- `getPublishedDestinationBySlug(slug)`
- `listPublishedExperiences()`
- `getPublishedExperienceBySlug(slug)`
- `listPublishedExperiencesByDestination(destinationId)`
- `listPublishedExperiencesByGuide(guideId)`
- `listPublicGuides()`
- `getPublicGuideBySlug(slug)`

Only `Destination.status === PUBLISHED`, `Experience.status === ACTIVE`, and guide records with `verified === true`, `active === true`, and `verificationStatus === APPROVED` are returned.

## Authenticated services

Authenticated services require the current user session and derive ownership from the authenticated user instead of trusting browser-supplied IDs.

- `getMyTravellerProfile()`
- `createOrUpdateMyTravellerProfile()`
- `getMyGuideProfile()`
- `updateMyGuideProfile()`

Traveller access is limited to the authenticated traveller’s profile. Guide access is limited to the authenticated guide’s own profile. Verification state cannot be modified through these profile update methods.

## Booking persistence foundation

Phase 3.2 adds the persisted booking workflow required for the traveller request lifecycle while leaving payment, reviews, messaging, and dashboards for later phases.

Implemented services:

- `createBookingRequest()`
- `getBookingById()`
- `listMyBookings()`
- `listIncomingBookingRequests()`
- `acceptBookingRequest()`
- `declineBookingRequest()`
- `confirmBooking()`
- `cancelBookingRequest()`

Booking creation is authenticated and server-authoritative:

- only `TRAVELLER` users can create bookings
- the authenticated session supplies the traveller identity
- the guide is derived from the selected published experience, not from client-controlled input
- the booking starts in `REQUESTED` and the server rejects any client-specified status
- experience validation requires a published destination, an active guide, and an approved/verified guide profile

Ownership is enforced server-side:

- travellers only see their own bookings
- guides only see bookings attached to their own guide profile
- admin access remains a future UI concern, but the service supports the existing role-based pattern if needed

Programmatic transition validation is housed in `assertBookingTransition()` and `canTransitionBooking()`.

The supported lifecycle for this phase is:

- `REQUESTED -> ACCEPTED`
- `REQUESTED -> DECLINED`
- `REQUESTED -> CANCELLED`
- `ACCEPTED -> CONFIRMED`
- `ACCEPTED -> CANCELLED`
- `CONFIRMED -> COMPLETED`
- `CONFIRMED -> CANCELLED`

Invalid transitions such as `DECLINED -> ACCEPTED`, `REQUESTED -> CONFIRMED`, or `CONFIRMED -> DECLINED` fail with the workspace `ConflictError` mechanism.

## API boundaries

The minimal booking exposure is:

- `GET /api/marketplace/bookings`
- `POST /api/marketplace/bookings`
- `GET /api/marketplace/bookings/[id]`
- `GET /api/marketplace/guide/bookings`
- `POST /api/marketplace/bookings/[id]/accept`
- `POST /api/marketplace/bookings/[id]/decline`
- `POST /api/marketplace/bookings/[id]/confirm`

Every mutating route uses the existing CSRF middleware and server-side authentication/authorization checks. Route handlers return safe `data` responses and map domain errors to HTTP codes.

## DTO boundaries

The booking DTOs are intentionally limited to safe lifecycle data and do not leak Prisma session metadata, password hashes, verification documents, storage references, reset tokens, or private profile content.

- `TravellerBookingDTO`
- `GuideBookingDTO`
- `BookingDetailDTO`

These carry only the identifiers, booking state, timestamps, public experience summary, and safe guide/traveller metadata required for the booking workflow.

## Concurrency approach

State-changing booking operations use Prisma transactions and conditional `updateMany` checks so two simultaneous requests cannot both succeed on the same stale state. The service re-validates the booking ownership and status inside the server-side transaction before committing the update.

## Development seed / smoke data

The repository does not add a broad seed framework. For local verification, deterministic test accounts and a real published experience are created directly in the running local database for smoke testing only. These are development-only fixture records and are not used in production.

## Deferred intentionally

The following remain intentionally outside this phase:

- payments
- payouts
- messaging/chat
- notifications
- reviews
- favourites
- admin dashboard
- guide/traveller dashboard redesign
- production deployment configuration
- external email provider integration

## DTOs

DTOs keep Prisma model details out of route handlers and UI responses. Public DTOs intentionally omit password hashes, session metadata, verification documents, reset tokens, and storage references.

## Domain errors

The domain layer raises structured errors and route handlers convert them to safe HTTP responses.

- `ValidationError` -> 400
- `AuthenticationError` -> 401
- `AuthorizationError` -> 403
- `NotFoundError` -> 404
- `ConflictError` -> 409
- fallback -> 500

## Validation

Zod schemas live under the shared marketplace schema boundary and validate destination, experience, traveller profile, guide profile, and booking request input.

## Important constraints

- All database reads and writes are routed through Prisma via the existing `src/server/db/client.ts`.
- Public UI data remains static and is not replaced in this phase.
- The new marketplace services are server-only and intended for later database-backed marketplace pages.
- No client component imports Prisma or server-only modules directly.
