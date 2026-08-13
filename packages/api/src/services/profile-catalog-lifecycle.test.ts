import {
  ProfileCatalogLifecycleError,
  resolveCatalogLifecycleChange,
} from "./profile-catalog-lifecycle";

describe(resolveCatalogLifecycleChange, () => {
  const active = {
    currentPublishedRevisionId: "revision-2",
    isProtectedDefault: false,
    lifecycle: "active" as const,
  };

  it("archives, disables, and restores without replacing the published revision", () => {
    expect(resolveCatalogLifecycleChange(active, "archive")).toEqual({
      currentPublishedRevisionId: "revision-2",
      lifecycle: "archived",
    });
    expect(resolveCatalogLifecycleChange(active, "disable").lifecycle).toBe(
      "disabled"
    );
    expect(
      resolveCatalogLifecycleChange(
        { ...active, lifecycle: "disabled" },
        "restore"
      )
    ).toEqual({
      currentPublishedRevisionId: "revision-2",
      lifecycle: "active",
    });
  });

  it("protects defaults from every containment action", () => {
    for (const action of ["archive", "disable"] as const) {
      expect(() =>
        resolveCatalogLifecycleChange(
          { ...active, isProtectedDefault: true },
          action
        )
      ).toThrow(ProfileCatalogLifecycleError);
    }
  });

  it("rejects invalid transitions", () => {
    expect(() =>
      resolveCatalogLifecycleChange(
        { ...active, lifecycle: "draft" },
        "archive"
      )
    ).toThrow("publicado");
    expect(() => resolveCatalogLifecycleChange(active, "restore")).toThrow(
      "retirado"
    );
  });
});
