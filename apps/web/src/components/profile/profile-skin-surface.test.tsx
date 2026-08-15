import { PROFILE_DEFAULT_SKIN_TOKENS } from "@repo/shared/profile-customization";
import { render, screen } from "@testing-library/react";

import {
  getProfileSkinStyle,
  ProfileSkinSurface,
} from "./profile-skin-surface";

describe(ProfileSkinSurface, () => {
  it("scopes validated semantic properties to its profile root", () => {
    render(
      <>
        <div data-testid="outside">Fuera</div>
        <ProfileSkinSurface
          skin={{
            backgroundAssetKey: null,
            key: "default",
            tokens: PROFILE_DEFAULT_SKIN_TOKENS,
          }}
        >
          <section data-testid="inside">Perfil</section>
        </ProfileSkinSurface>
      </>
    );

    const root = screen.getByTestId("inside").parentElement;
    expect(root.dataset.profileSkin).toBe("default");
    expect(root?.style.color).toBe("#fafafa");
    expect(screen.getByTestId("outside").getAttribute("style")).toBeNull();
  });

  it("renders managed media only through the configured bucket URL", () => {
    render(
      <ProfileSkinSurface
        skin={{
          backgroundAssetKey: "media/static.webp",
          key: "aurora",
          tokens: PROFILE_DEFAULT_SKIN_TOKENS,
        }}
      >
        <span data-testid="content">Perfil</span>
      </ProfileSkinSurface>
    );

    expect(
      screen.getByTestId("content").parentElement?.style.backgroundImage
    ).toMatch(/^url\(.*media\/static\.webp.*\), linear-gradient/);
  });

  it("exposes separate shell and showcase skin surfaces", () => {
    const style = getProfileSkinStyle({
      backgroundAssetKey: null,
      key: "custom",
      tokens: {
        ...PROFILE_DEFAULT_SKIN_TOKENS,
        shellOpacity: 0.8,
        shellSurface: "#123456",
        showcaseOpacity: 0.9,
        showcaseSurface: "#654321",
      },
    });

    expect(style["--profile-shell"]).toBe("#123456cc");
    expect(style["--card"]).toBe("#654321e6");
  });
});
