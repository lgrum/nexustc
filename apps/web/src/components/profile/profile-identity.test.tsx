import { render, screen } from "@testing-library/react";

import { ProfileIdentity } from "./profile-identity";

it("leaves enough line height for public profile name descenders", () => {
  render(
    <ProfileIdentity density="public" nameAs="h1" user={{ name: "Lightg" }} />
  );

  const heading = screen.getByRole("heading", { name: "Lightg" });

  expect(heading.classList.contains("profile-display-name")).toBe(true);
  expect(heading.classList.contains("leading-none")).toBe(false);
});
