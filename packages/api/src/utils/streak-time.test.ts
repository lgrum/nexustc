import {
  getStreakDayPeriod,
  getTimezoneChangeEffectiveAt,
  isValidIanaTimezone,
} from "./streak-time";

describe("streak civil days", () => {
  it.each([
    [
      "America/New_York",
      "2026-03-08T05:00:00.000Z",
      "2026-03-09T04:00:00.000Z",
      23,
    ],
    [
      "America/New_York",
      "2026-11-01T04:00:00.000Z",
      "2026-11-02T05:00:00.000Z",
      25,
    ],
    [
      "Pacific/Kiritimati",
      "2026-08-06T10:00:00.000Z",
      "2026-08-07T10:00:00.000Z",
      24,
    ],
  ])(
    "resolves %s local midnight boundaries",
    (timezone, startsAt, endsAt, hours) => {
      const period = getStreakDayPeriod(new Date(startsAt), timezone);

      expect(period.startsAt.toISOString()).toBe(startsAt);
      expect(period.endsAt.toISOString()).toBe(endsAt);
      expect(
        (period.endsAt.getTime() - period.startsAt.getTime()) / 3_600_000
      ).toBe(hours);
    }
  );

  it("assigns the day from the received server instant", () => {
    expect(
      getStreakDayPeriod(
        new Date("2026-08-08T02:59:59.000Z"),
        "America/Argentina/Buenos_Aires"
      ).localDate
    ).toBe("2026-08-07");
    expect(
      getStreakDayPeriod(
        new Date("2026-08-08T03:00:00.000Z"),
        "America/Argentina/Buenos_Aires"
      ).localDate
    ).toBe("2026-08-08");
  });

  it("uses the first representable instant when a timezone skips midnight", () => {
    const period = getStreakDayPeriod(
      new Date("2026-09-05T12:00:00.000Z"),
      "America/Santiago"
    );

    expect(period.endsAt.toISOString()).toBe("2026-09-06T04:00:00.000Z");
  });

  it("resolves case variants through the same canonical timezone", () => {
    const now = new Date("2026-08-08T12:00:00.000Z");

    expect(getStreakDayPeriod(now, "america/new_york")).toEqual(
      getStreakDayPeriod(now, "America/New_York")
    );
  });

  it("rejects invalid timezone names instead of falling back to UTC", () => {
    expect(isValidIanaTimezone("Not/A_Zone")).toBe(false);
    expect(isValidIanaTimezone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isValidIanaTimezone("CET")).toBe(true);
  });

  it.each([
    [
      "UTC",
      "America/Los_Angeles",
      "2026-08-08T12:00:00.000Z",
      "2026-08-09T07:00:00.000Z",
    ],
    [
      "America/New_York",
      "America/Los_Angeles",
      "2026-03-08T16:00:00.000Z",
      "2026-03-09T07:00:00.000Z",
    ],
    [
      "America/Los_Angeles",
      "America/New_York",
      "2026-11-01T18:00:00.000Z",
      "2026-11-03T05:00:00.000Z",
    ],
    [
      "Pacific/Kiritimati",
      "Pacific/Honolulu",
      "2026-08-08T00:00:00.000Z",
      "2026-08-08T10:00:00.000Z",
    ],
  ])(
    "starts a %s to %s change on the first full destination day",
    (currentTimezone, nextTimezone, requestedAt, effectiveAt) => {
      expect(
        getTimezoneChangeEffectiveAt(
          new Date(requestedAt),
          currentTimezone,
          nextTimezone
        ).toISOString()
      ).toBe(effectiveAt);
    }
  );
});
