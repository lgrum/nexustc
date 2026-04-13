import {
  engagementPromptListFromTextarea,
  engagementPromptListToTextarea,
} from "@repo/shared/engagement-prompts";

describe("engagement prompt textarea helpers", () => {
  it("preserves in-progress whitespace while editing", () => {
    const textareaValue = "Primera pregunta \n \t";

    expect(engagementPromptListFromTextarea(textareaValue)).toStrictEqual([
      "Primera pregunta ",
      " \t",
    ]);
    expect(
      engagementPromptListToTextarea(
        engagementPromptListFromTextarea(textareaValue)
      )
    ).toBe(textareaValue);
  });
});
