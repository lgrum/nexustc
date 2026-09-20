import { render, screen } from "@testing-library/react";

import { LibraryPagination } from "./library-shared";

it("renders canonical URLs for catalog pagination controls", () => {
  render(
    <LibraryPagination
      getPageHref={(page) => `/juegos?page=${page}`}
      onPageChange={() => {}}
      pagination={{
        page: 3,
        pageSize: 12,
        totalItems: 60,
        totalPages: 5,
      }}
    />
  );

  expect(
    screen.getByRole("button", { name: "2", exact: true }).getAttribute("href")
  ).toBe("/juegos?page=2");
  expect(
    screen.getByRole("button", { name: "Go to next page" }).getAttribute("href")
  ).toBe("/juegos?page=4");
});
