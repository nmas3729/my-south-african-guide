import { describe, expect, it } from "vitest";
import { assertBookingTransition, canTransitionBooking } from "../../src/server/marketplace/bookings/state-machine";

describe("booking state machine", () => {
  it("allows the documented MVP lifecycle", () => {
    expect(canTransitionBooking("REQUESTED", "ACCEPTED")).toBe(true);
    expect(canTransitionBooking("REQUESTED", "DECLINED")).toBe(true);
    expect(canTransitionBooking("REQUESTED", "CANCELLED")).toBe(true);
    expect(canTransitionBooking("ACCEPTED", "CONFIRMED")).toBe(true);
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