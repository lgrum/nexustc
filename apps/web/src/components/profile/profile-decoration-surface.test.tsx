import { render, screen } from "@testing-library/react";

import { ProfileDecorationSurface } from "./profile-decoration-surface";

describe(ProfileDecorationSurface, () => {
  it("scopes decorative layers and keeps them pointer transparent", () => {
    const { container } = render(
      <ProfileDecorationSurface
        decorations={[
          {
            effectKey: "shimmer",
            fontKey: null,
            mediaAssetKey: null,
            reducedMotion: null,
            slot: "profile-frame",
          },
        ]}
      >
        <button type="button">Identidad</button>
      </ProfileDecorationSurface>
    );

    expect(screen.getByRole("button", { name: "Identidad" })).toBeTruthy();
    expect(container.querySelector("[data-profile-decorations]")).toBeTruthy();
    expect(
      container.querySelector("[data-decoration-slot]")?.className
    ).toContain("pointer-events-none");
  });

  it("omits animated ambient layers for reduced motion without removing selection", () => {
    const { container } = render(
      <ProfileDecorationSurface
        decorations={[
          {
            effectKey: "orbit-sparkles",
            fontKey: null,
            mediaAssetKey: null,
            reducedMotion: { behavior: "omit" },
            slot: "ambient-effect",
          },
        ]}
      >
        <p>Contenido</p>
      </ProfileDecorationSurface>
    );
    const layer = container.querySelector(
      '[data-decoration-slot="ambient-effect"]'
    );
    expect(layer?.className).toContain("motion-reduce:hidden");
    expect((layer as HTMLElement | null)?.dataset.decorationSlot).toBe(
      "ambient-effect"
    );
  });

  it("can force the actual reduced-motion fallback in owner previews", () => {
    const { container } = render(
      <ProfileDecorationSurface
        decorations={[
          {
            effectKey: "orbit-sparkles",
            fontKey: null,
            mediaAssetKey: null,
            reducedMotion: { behavior: "omit" },
            slot: "ambient-effect",
          },
        ]}
        forceReducedMotion
      >
        <p>Contenido</p>
      </ProfileDecorationSurface>
    );
    expect(container.querySelector("[data-decoration-slot]")).toBeNull();
    expect(screen.getByText("Contenido")).toBeTruthy();
  });
});
