import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { canTransitionBooking, assertBookingTransition } from "../../src/server/marketplace/bookings/state-machine";

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

describe("payment gate: no verified payment means no CONFIRMED booking or reservation", () => {
  it("allows no booking status to transition into CONFIRMED", () => {
    for (const from of ["REQUESTED", "ACCEPTED", "DECLINED", "CANCELLED", "COMPLETED", "PAID", "REFUNDED", "DISPUTED"] as const) {
      expect(canTransitionBooking(from, "CONFIRMED")).toBe(false);
    }
  });

  it("contains no code that writes BookingStatus.CONFIRMED anywhere in the application", () => {
    // A structural guard: any future write of CONFIRMED must fail this test until a verified-payment
    // gate exists. This is the regression protection for the Phase 2D business rule.
    const offenders = walk(SRC).filter((file) => /status:\s*BookingStatus\.CONFIRMED/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("contains no code that writes SlotReservationStatus.CONFIRMED anywhere in the application", () => {
    // A reservation may only be confirmed by the future verified-payment flow.
    const offenders = walk(SRC).filter((file) => /status:\s*SlotReservationStatus\.CONFIRMED/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("exposes no route or service that confirms a booking", () => {
    const files = walk(SRC);
    const routeFiles = files.filter((file) => file.includes(`${join("app", "api")}`) && file.endsWith("route.ts"));
    const confirmationRoutes = routeFiles.filter((file) => /confirm/i.test(file));
    expect(confirmationRoutes).toEqual([]);

    // No exported service function may perform a confirmation.
    const serviceFiles = files.filter((file) => file.includes(join("server", "marketplace")) && file.endsWith(".ts"));
    const confirmingServices = serviceFiles.filter((file) => /export\s+async\s+function\s+\w*[Cc]onfirm\w*Booking/.test(readFileSync(file, "utf8")));
    expect(confirmingServices).toEqual([]);
  });

  it("emits no payment events while payment is unimplemented", () => {
    const offenders = walk(SRC).filter((file) => /type:\s*BookingEventType\.PAYMENT_/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("booking state machine", () => {
  it("allows the documented MVP lifecycle", () => {
    expect(canTransitionBooking("REQUESTED", "ACCEPTED")).toBe(true);
    expect(canTransitionBooking("REQUESTED", "DECLINED")).toBe(true);
    expect(canTransitionBooking("REQUESTED", "CANCELLED")).toBe(true);
    expect(canTransitionBooking("ACCEPTED", "CANCELLED")).toBe(true);
    expect(canTransitionBooking("CONFIRMED", "COMPLETED")).toBe(true);
    expect(canTransitionBooking("CONFIRMED", "CANCELLED")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransitionBooking("DECLINED", "ACCEPTED")).toBe(false);
    expect(canTransitionBooking("DECLINED", "CONFIRMED")).toBe(false);
    expect(canTransitionBooking("REQUESTED", "CONFIRMED")).toBe(false);
    expect(canTransitionBooking("CONFIRMED", "ACCEPTED")).toBe(false);
    expect(canTransitionBooking("CONFIRMED", "DECLINED")).toBe(false);
    expect(canTransitionBooking("COMPLETED", "CANCELLED")).toBe(false);
    expect(() => assertBookingTransition("DECLINED", "ACCEPTED")).toThrow("Cannot change booking");
  });
});
