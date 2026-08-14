import { render } from "@testing-library/react";

import { ProfileShowcaseLayout } from "./profile-showcase-layout";

describe(ProfileShowcaseLayout, () => {
  it.each(["stack", "grid", "spotlight"] as const)(
    "keeps canonical DOM order in the %s layout",
    (rendererKey) => {
      const { container } = render(
        <ProfileShowcaseLayout rendererKey={rendererKey}>
          <div>
            <section data-showcase-variant="compact">Biblioteca</section>
            <section data-showcase-variant="featured">Reseñas</section>
          </div>
        </ProfileShowcaseLayout>
      );

      const layout = container.firstElementChild as HTMLElement | null;
      const grid = layout?.querySelector<HTMLElement>(
        "[data-profile-showcase-grid]"
      );
      expect(layout?.dataset.profileLayout).toBe(rendererKey);
      expect(layout?.className).toContain("@container/profile");
      expect(grid?.className).toContain(
        rendererKey === "stack" ? "flex flex-col" : "grid grid-cols-1"
      );
      expect(grid?.className).toContain("[&>div>section]:p-5");
      if (rendererKey !== "stack") {
        expect(grid?.className).toContain("@md/profile:grid-cols-2");
      }
      if (rendererKey === "spotlight") {
        expect(grid?.className).toContain("section:first-of-type");
      }
      expect(
        [...(layout?.querySelectorAll("section") ?? [])].map(
          (section) => section.textContent
        )
      ).toEqual(["Biblioteca", "Reseñas"]);
    }
  );
});
