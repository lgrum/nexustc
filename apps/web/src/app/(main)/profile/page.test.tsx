import Page, { parseProfileSection } from "./page";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@repo/auth", () => ({
  auth: { api: { getSession } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({}),
}));

vi.mock("./profile-client", () => ({
  ProfileClient: () => null,
}));

describe(parseProfileSection, () => {
  it("keeps valid URL-backed profile sections", () => {
    expect(parseProfileSection("library")).toBe("library");
    expect(parseProfileSection(["security", "overview"])).toBe("security");
  });

  it("falls back to the overview for invalid or missing sections", () => {
    expect(parseProfileSection("unknown")).toBe("overview");
    expect(parseProfileSection()).toBe("overview");
  });
});

it("passes the server-authenticated user to the profile client", async () => {
  const user = { id: "user-1", name: "Light" };
  getSession.mockResolvedValue({ user });

  const element = await Page({ searchParams: Promise.resolve({}) });

  expect(element.props.user).toBe(user);
});
