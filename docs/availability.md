# Availability and Slot Generation

## Generation

`POST /api/marketplace/admin/availability/generate` is an ADMIN-only mutation. It requires the existing session and CSRF checks, is rate-limited, and accepts an experience ID with a `[dateFrom, dateTo)` range. The maximum defaults to 90 days and is configured by `AVAILABILITY_GENERATION_HORIZON_DAYS` (1 through 365).

The generator uses `Experience.duration` as both the elapsed slot duration and recurring departure step. The retained `AvailabilityRule.durationMinutes` field does not control generation. A recurring departure is included only when its entire interval fits within the rule's local-time range.

Experience local times resolve only through the experience's IANA timezone. Guide schedules resolve through the assigned guide's IANA timezone. Nonexistent and ambiguous wall times fail with a validation error; generation never uses the process or browser timezone.

## Eligibility and Exceptions

An assigned guide must be active, verified, approved, and either the experience's preassigned guide or explicitly linked through `ExperienceGuide`. A guide must have an active local schedule containing the complete slot interval; any overlapping guide unavailability rejects that candidate. PostgreSQL's `TourSlot_guide_no_overlap` exclusion constraint remains the final concurrency guard.

Blocking exceptions take precedence over capacity overrides and recurring rules. New affected departures are not created. During generation, existing future OPEN slots in the requested date window affected by a matching block are changed to CLOSED, not deleted; bookings are never changed. CLOSED or CANCELLED slots are not reopened by regeneration.

Special departures can be generated without recurring rules, but still require a valid guide schedule and capacity. Capacity precedence is explicit generation capacity, matching exception override, recurring rule override, then `Experience.groupLimit`. A missing or non-positive capacity fails generation.

## Retry Ownership

The generator owns the initial values of `experienceId`, assigned `guideId`, `startsAt`, `endsAt`, `timezone`, `capacity`, and initial `OPEN` status. It inserts only missing `(experienceId, startsAt)` departures. On retry, an existing slot is preserved without reconciliation, including manual/admin adjustments. Exception blocking is the only existing-slot mutation performed by generation, and it only closes future OPEN slots.

`GET /api/marketplace/experiences/[slug]/slots` reads persisted future OPEN slots only. It never generates inventory during lookup.

## Taking a departure out of service

`POST /api/marketplace/admin/availability/slots/[id]/close` is an ADMIN-only mutation that closes one concrete departure. It accepts no request body: the only transition is `OPEN -> CLOSED`, and generator-owned fields (`startsAt`, `endsAt`, `guideId`, `timezone`, `capacity`) are never written. Closure is refused for a slot that has already started, for a slot that is not `OPEN`, and for a slot with linked bookings, because closing it would silently invalidate a customer booking. There is deliberately no general slot create/edit/delete API.

## Guide self-service

A guide manages only their own schedule and unavailability. The guide identifier is always derived from the authenticated session; a client-supplied `guideId` is rejected because the request schemas are strict. Ownership is enforced in the database query itself (`where: { id, guideId }`), so a guide can never read or modify another guide's rows.

- `GET|POST /api/marketplace/guide/availability/schedule`
- `PATCH|DELETE /api/marketplace/guide/availability/schedule/[id]` (DELETE is a soft disable; the row is retained)
- `GET|POST /api/marketplace/guide/availability/unavailability`
- `DELETE /api/marketplace/guide/availability/unavailability/[id]` (hard delete; `GuideUnavailability` has no soft-delete column)

Creating a dated unavailability window is the immediate safety mechanism for removing a guide from a concrete future period. It records the window and closes every affected future `OPEN` slot in a single transaction. Recurring schedule edits deliberately do not reconcile already-materialized slots, and generation never closes slots for guide unavailability. If any affected slot carries a booking, the whole transaction rolls back, so no unavailability row is persisted and no slot is left partially applied. Slots are never deleted, and removing a window does not reopen the departures it closed.