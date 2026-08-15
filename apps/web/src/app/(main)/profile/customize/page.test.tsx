import Page from "./page";

const mocks = vi.hoisted(() => ({
  customizationEnabled: true,
  getCustomizationEditorState: vi.fn(),
  getCustomizationScalarPreview: vi.fn(),
  getFavoriteGamesEditorState: vi.fn(),
  getPublic: vi.fn(),
  getSession: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("@repo/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@repo/env", () => ({
  env: {
    get PROFILE_CUSTOMIZATION_ENABLED() {
      return mocks.customizationEnabled;
    },
  },
}));
vi.mock("@/lib/orpc", () => ({
  orpcClient: {
    profile: {
      getCustomizationEditorState: mocks.getCustomizationEditorState,
      getCustomizationScalarPreview: mocks.getCustomizationScalarPreview,
      getFavoriteGamesEditorState: mocks.getFavoriteGamesEditorState,
      getPublic: mocks.getPublic,
    },
  },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({}),
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("./profile-customizer", () => ({
  ProfileCustomizer: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.customizationEnabled = true;
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
});

it("returns not found before loading editor procedures when customization is disabled", async () => {
  mocks.customizationEnabled = false;

  await expect(Page()).rejects.toThrow("NOT_FOUND");
  expect(mocks.getCustomizationEditorState).not.toHaveBeenCalled();
  expect(mocks.getFavoriteGamesEditorState).not.toHaveBeenCalled();
  expect(mocks.getPublic).not.toHaveBeenCalled();
  expect(mocks.getCustomizationScalarPreview).not.toHaveBeenCalled();
});
