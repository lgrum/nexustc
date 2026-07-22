import { render, screen } from "@testing-library/react";

import { ProfileAvatar } from "./profile-avatar";

vi.mock("facehash", () => ({
  Avatar: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  AvatarFallback: ({
    facehashProps,
    name,
  }: {
    facehashProps: { colors: string[] };
    name: string;
  }) => <span data-colors={facehashProps.colors.join(",")}>{name}</span>,
  AvatarImage: ({ src }: { src?: string }) =>
    src ? <span data-avatar-src={src} /> : null,
}));

describe(ProfileAvatar, () => {
  it("uses the configured fallback color and exposes an accessible name", () => {
    render(
      <ProfileAvatar
        user={{
          avatarFallbackColor: "#123456",
          name: "Nexus User",
        }}
      />
    );

    const avatar = screen.getByRole("img", { name: "Avatar de Nexus User" });
    expect(avatar.textContent).toContain("Nexus User");
    const fallback = avatar.querySelector<HTMLElement>("[data-colors]");
    expect(fallback?.dataset.colors).toMatch(/^#123456,/);
  });

  it("can be decorative when the nearby identity already names the user", () => {
    const { container } = render(
      <ProfileAvatar decorative user={{ name: "Nexus User" }} />
    );

    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe(
      "true"
    );
    expect(screen.queryByRole("img")).toBeNull();
  });
});
