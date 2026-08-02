import { call } from "@orpc/server";

import type { Context } from "../context";
import appThemeRouter from "./app-theme";

vi.mock("@repo/auth", () => ({ auth: { api: {} } }));
vi.mock("@repo/db", () => ({ eq: vi.fn(() => "where") }));
vi.mock("@repo/db/schema/app", () => ({
  patron: { userId: {} },
  user: { id: {} },
}));

function createContext({
  active = false,
  role = "admin",
  selectedTheme = "predeterminado",
  tier = "none",
}: {
  active?: boolean;
  role?: string;
  selectedTheme?: string;
  tier?: string;
} = {}) {
  let storedTheme = selectedTheme;
  const update = vi.fn(() => ({
    set: vi.fn((value: { selectedTheme: string }) => {
      storedTheme = value.selectedTheme;
      return { where: vi.fn().mockResolvedValue(null) };
    }),
  }));
  const context = {
    db: {
      query: {
        patron: {
          findFirst: vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve({ isActivePatron: active, tier })
            ),
        },
        user: {
          findFirst: vi
            .fn()
            .mockImplementation(() =>
              Promise.resolve({ selectedTheme: storedTheme })
            ),
        },
      },
      update,
    },
    headers: new Headers(),
    session: { user: { id: "user-1", role } },
  } as unknown as Context;

  return { context, update };
}

describe("appTheme router", () => {
  it("returns authoritative staff theme state", async () => {
    const { context } = createContext({ selectedTheme: "ceniza-solar" });

    await expect(
      call(appThemeRouter.getMine, undefined, { context })
    ).resolves.toMatchObject({
      catalogVisible: true,
      effectiveTheme: "ceniza-solar",
      selectedTheme: "ceniza-solar",
    });
  });

  it("falls back safely from a stale stored ID without writing", async () => {
    const { context, update } = createContext({ selectedTheme: "retirado" });

    await expect(
      call(appThemeRouter.getMine, undefined, { context })
    ).resolves.toMatchObject({
      effectiveTheme: "predeterminado",
      selectedTheme: "predeterminado",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("saves a permitted selection and returns the stored result", async () => {
    const { context, update } = createContext({ role: "owner" });

    await expect(
      call(appThemeRouter.select, { themeId: "ceniza-solar" }, { context })
    ).resolves.toMatchObject({
      effectiveTheme: "ceniza-solar",
      selectedTheme: "ceniza-solar",
    });
    expect(update).toHaveBeenCalledOnce();
  });

  it("rejects a forged premium selection before updating", async () => {
    const { context, update } = createContext({ role: "moderator" });

    await expect(
      call(appThemeRouter.select, { themeId: "ceniza-solar" }, { context })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(update).not.toHaveBeenCalled();
  });

  it("always lets an authenticated account select Default", async () => {
    const { context, update } = createContext({
      role: "user",
      selectedTheme: "ceniza-solar",
    });

    await expect(
      call(appThemeRouter.select, { themeId: "predeterminado" }, { context })
    ).resolves.toMatchObject({ effectiveTheme: "predeterminado" });
    expect(update).toHaveBeenCalledOnce();
  });

  it("validates catalog input and authentication at the procedure boundary", async () => {
    const { context } = createContext();
    await expect(
      call(
        appThemeRouter.select,
        { themeId: "inventado" as never },
        { context }
      )
    ).rejects.toBeDefined();
    await expect(
      call(appThemeRouter.getMine, undefined, {
        context: { ...context, session: null },
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
