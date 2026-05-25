import {
  comicCreateSchema,
  postCreateSchema,
  webUrlSchema,
} from "@repo/shared/schemas";
import { describe, expect, it } from "vitest";

const baseContentInput = {
  acceptSlugDeduplication: false,
  adsLinks: "",
  censorship: "",
  creatorId: null,
  creatorName: "Creator",
  documentStatus: "draft",
  languages: [],
  manualEngagementQuestions: [],
  mediaIds: [],
  seriesId: null,
  seriesOrder: 0,
  seriesTitle: "",
  status: "status-id",
  tags: [],
  thumbnailImageCount: 1,
  title: "Title",
} as const;
const scriptUrl = `java${"script"}:alert(1)`;

describe("web URL schema", () => {
  it("accepts http and https URLs with domain hostnames", () => {
    expect(webUrlSchema.safeParse("https://example.com/path").success).toBe(
      true
    );
    expect(webUrlSchema.safeParse("http://sub.example.com").success).toBe(true);
  });

  it("rejects non-web schemes and non-domain hostnames", () => {
    expect(webUrlSchema.safeParse(scriptUrl).success).toBe(false);
    expect(
      webUrlSchema.safeParse("data:text/html,<script></script>").success
    ).toBe(false);
    expect(webUrlSchema.safeParse("https://localhost:3000").success).toBe(
      false
    );
  });

  it("applies web URL validation to creator links", () => {
    const postResult = postCreateSchema.safeParse({
      ...baseContentInput,
      changelog: "",
      content: "",
      creatorLink: scriptUrl,
      earlyAccessEnabled: false,
      engine: "",
      graphics: "",
      platforms: [],
      premiumLinks: "",
      premiumLinksAccessLevel: "auto",
      thumbnailImageCount: 4,
      type: "post",
      version: "",
      vip12EarlyAccessHours: 0,
      vip8EarlyAccessHours: 0,
    });
    const comicResult = comicCreateSchema.safeParse({
      ...baseContentInput,
      creatorLink: scriptUrl,
      premiumLinks: "",
      style: "style-id",
      type: "comic",
    });

    expect(postResult.success).toBe(false);
    expect(comicResult.success).toBe(false);
  });
});
