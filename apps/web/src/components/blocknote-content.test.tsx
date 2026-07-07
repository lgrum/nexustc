import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { BlockNoteContent } from "./blocknote-content";

test("renders stored blocks without unsafe links", () => {
  const unsafeScheme = ["java", "script:"].join("");
  const value = JSON.stringify([
    {
      content: [
        { styles: { bold: true }, text: "Hello", type: "text" },
        {
          content: " unsafe",
          href: `${unsafeScheme}alert(1)`,
          type: "link",
        },
      ],
      id: "heading",
      props: { level: 1 },
      type: "heading",
    },
  ]);

  const html = renderToStaticMarkup(<BlockNoteContent value={value} />);

  expect(html).toContain("<strong>Hello</strong>");
  expect(html).toContain(" unsafe");
  expect(html).not.toContain(unsafeScheme);
});
