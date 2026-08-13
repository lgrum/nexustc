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
      expect(layout?.dataset.profileLayout).toBe(rendererKey);
      expect(layout?.className).toContain(
        rendererKey === "stack" ? "flex flex-col" : "grid grid-cols-1"
      );
      if (rendererKey === "spotlight") {
        expect(layout?.className).toContain("section:first-of-type");
      }
      expect(
        [...(layout?.querySelectorAll("section") ?? [])].map(
          (section) => section.textContent
        )
      ).toEqual(["Biblioteca", "Reseñas"]);
    }
  );
});
