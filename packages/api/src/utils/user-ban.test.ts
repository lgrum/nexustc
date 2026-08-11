import { isUserBanActive } from "./user-ban";

const now = new Date("2026-08-10T12:00:00.000Z");

describe("active user bans", () => {
  it("distinguishes indefinite and unexpired bans from expired bans", () => {
    expect(isUserBanActive({ banExpires: null, banned: false }, now)).toBe(
      false
    );
    expect(isUserBanActive({ banExpires: null, banned: true }, now)).toBe(true);
    expect(
      isUserBanActive(
        { banExpires: new Date("2026-08-10T12:00:00.001Z"), banned: true },
        now
      )
    ).toBe(true);
    expect(
      isUserBanActive(
        { banExpires: new Date("2026-08-10T12:00:00.000Z"), banned: true },
        now
      )
    ).toBe(false);
  });
});
