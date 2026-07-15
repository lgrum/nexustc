import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { mocked: true },
  getSession: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("@repo/db", () => ({
  db: mocks.db,
}));

const { createContext, createPublicContext } = await import("./context");

const freshSession = { user: { id: "user-1", role: "owner" } };

describe("API context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(freshSession);
  });

  it("loads the session without the cookie cache", async () => {
    const headers = new Headers({ authorization: "Bearer token" });

    await createContext(headers);

    expect(mocks.getSession).toHaveBeenCalledExactlyOnceWith({
      headers,
      query: { disableCookieCache: true },
    });
  });

  it("returns the fresh session, headers, and database", async () => {
    const headers = new Headers();

    const context = await createContext(headers);

    expect(context).toMatchObject({
      db: mocks.db,
      headers,
      session: freshSession,
    });
  });

  it("creates a public context without loading a session", () => {
    const context = createPublicContext();

    expect(context.session).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});
