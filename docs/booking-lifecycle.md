# Booking and reservation lifecycle

## The confirmation gate

A booking may only become `BookingStatus.CONFIRMED` once payment has been **successfully processed and server-side verified at 100%**. Nothing else may cause a confirmation: not an accepted hold, not a guide's approval, not a client redirect, and not an administrative shortcut.

Until the payment phase exists, `ACCEPTED -> CONFIRMED` is removed from the booking state machine entirely, so `assertBookingTransition()` rejects it. The traveller confirmation endpoint has been decommissioned and no confirmation service is exported. `tests/marketplace/state-machine.test.ts` guards this permanently by asserting that no source file writes `BookingStatus.CONFIRMED` or `SlotReservationStatus.CONFIRMED`, that no confirmation route or service exists, and that no payment event is emitted.

## Reservation lifecycle

```text
HELD
 ├──> RELEASED   traveller releases, booking cancels, or a guide declines
 ├──> EXPIRED    the 30 minute hold elapsed
 └──> CONFIRMED  reserved for the future verified-payment flow

CONFIRMED
 └──> CANCELLED  reserved for the future refund/cancellation flow
```

A hold that has already elapsed is always transitioned to `EXPIRED`, never `RELEASED`: an expired hold is never resurrected, and reporting it as released would misstate why the seats were freed.

## Booking synchronization

Cancelling or declining a booking releases its reservation in the **same transaction**, so there is never a `CANCELLED` or `DECLINED` booking that still holds capacity. The departure row is locked first, matching the Phase 2C lock order, so these operations serialize with concurrent reservation creation.

Releasing a hold directly also cancels the owning unpaid booking: an unpaid booking has no other route out of the state machine, and leaving it live would block the slot indefinitely.

Legacy bookings that predate reservations have no `slotId`. Cancellation and decline tolerate that and simply perform the booking transition.

## Capacity

`TourSlot.capacity` is the only authority. Active capacity is the sum of `partySize` over reservations that are `CONFIRMED`, or `HELD` with `expiresAt > now`. `RELEASED`, `EXPIRED` and `CANCELLED` never consume capacity, and a stale `HELD` reservation is never counted. Mirrors are recomputed from the authoritative rows after every transition rather than incremented.

## Ownership

Reservation ownership derives from the authenticated session. Reading or releasing another traveller's reservation returns `NotFoundError`, which is indistinguishable from the reservation not existing and avoids leaking its existence. Guide decline and cancellation keep their existing ownership rules.

## Idempotency

Every lifecycle transition uses a conditional `updateMany` guarded on the current status. Repeating a release, cancellation, decline or expiry is safe, reports the current state rather than failing, and never emits a duplicate lifecycle event.

## Endpoints

- `POST /api/marketplace/bookings/reserve` — place a hold (Phase 2C)
- `GET /api/marketplace/bookings/reserve/[id]/status` — read-only status for the owning traveller
- `DELETE /api/marketplace/bookings/reserve/[id]` — release the traveller's own hold
- `GET /api/marketplace/experiences/[slug]/slots` — bookable slots, including `remainingCapacity`

There is deliberately no endpoint that confirms a booking or a reservation.