import type { post, postRating, term } from "@repo/db/schema/app";
import type { PremiumLinksDescriptor } from "@repo/shared/constants";

export type TermType = typeof term.$inferSelect;

export type EngagementPromptType = {
  id: string;
  text: string;
  source: "manual" | "tag";
  tagTermId: string | null;
};

export type PostType = Omit<
  typeof post.$inferSelect,
  "authorId" | "premiumLinks" | "status"
> & {
  likes: number;
  favorites: number;
  terms: Omit<TermType, "createdAt" | "updatedAt">[];
  averageRating?: number;
  ratingCount?: number;
  premiumLinksAccess: PremiumLinksDescriptor;
  engagementPrompts: EngagementPromptType[];
};

export type RatingType = typeof postRating.$inferSelect;

export type RatingWithAuthor = RatingType & {
  author: {
    id: string;
    name: string;
    image: string | null;
    role: string;
  } | null;
};
