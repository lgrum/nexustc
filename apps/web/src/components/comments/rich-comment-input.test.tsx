import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { RichCommentInput } from "./rich-comment-input";

test("serializes an empty contenteditable line as one newline", () => {
  const onChange = vi.fn();

  render(
    <RichCommentInput
      emojiMap={new Map()}
      onChange={onChange}
      stickerMap={new Map()}
      value=""
    />
  );

  const editor = screen.getByRole("textbox");
  editor.innerHTML = "<div>11111</div><div><br></div><div>22222</div>";

  fireEvent.input(editor);

  expect(onChange).toHaveBeenLastCalledWith("11111\n\n22222");
});
