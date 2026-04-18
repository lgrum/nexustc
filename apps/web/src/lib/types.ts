import type { post, postRating, term } from "@repo/db/schema/app";
import type { PremiumLinksDescriptor } from "@repo/shared/constants";
import type { EarlyAccessView } from "@repo/shared/early-access";

export type TermType = typeof term.$inferSelect;

export type EngagementPromptType = {
  id: string;
  text: string;
  source: "manual" | "tag";
  tagTermId: string | null;
};

export type PostType = Omit<
  typeof post.$inferSelect,
  | "authorId"
  | "comicLastUpdateAt"
  | "comicPageCount"
  | "coverMediaId"
  | "earlyAccessEnabled"
  | "earlyAccessPublicAt"
  | "earlyAccessStartedAt"
  | "earlyAccessVip12EndsAt"
  | "premiumLinksAccessLevel"
  | "premiumLinks"
  | "status"
  | "vip12EarlyAccessHours"
  | "vip8EarlyAccessHours"
> & {
  likes: number;
  favorites: number;
  coverImageObjectKey?: string | null;
  creatorAvatarObjectKey?: string | null;
  terms: Omit<TermType, "createdAt" | "updatedAt">[];
  averageRating?: number;
  ratingCount?: number;
  earlyAccess: EarlyAccessView;
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
