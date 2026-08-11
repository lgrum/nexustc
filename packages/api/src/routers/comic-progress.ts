import { getRedis } from "@repo/db";
import {
  comicProgressComicSchema,
  comicProgressUpdateSchema,
} from "@repo/shared/schemas";

import { protectedProcedure, slidingWindowRatelimitMiddleware } from "../index";
import {
  getComicProgressOverview,
  startComicReadingSession,
  trackComicPageView,
} from "../services/comic-progress";
import { buildIntegrityCorrelationEvidence } from "../utils/integrity-evidence";

export default {
  getByComicId: protectedProcedure
    .input(comicProgressComicSchema)
    .handler(async ({ context: { db, session }, input, errors }) => {
      const overview = await getComicProgressOverview(db, {
        comicId: input.comicId,
        role: session.user.role,
        userId: session.user.id,
      });

      if (!overview) {
        throw errors.NOT_FOUND();
      }

      return overview;
    }),

  getResume: protectedProcedure
    .input(comicProgressComicSchema)
    .handler(async ({ context: { db, session }, input, errors }) => {
      const overview = await getComicProgressOverview(db, {
        comicId: input.comicId,
        role: session.user.role,
        userId: session.user.id,
      });

      if (!overview) {
        throw errors.NOT_FOUND();
      }

      return {
        currentPageCount: overview.currentPageCount,
        lastPageRead: overview.lastPageRead,
        resumePage: overview.resumePage,
        shouldPrompt: overview.resumePromptEnabled,
        vipResumeEnabled: overview.vipResumeEnabled,
      };
    }),

  startSession: protectedProcedure
    .use(slidingWindowRatelimitMiddleware(10, 60))
    .input(comicProgressComicSchema)
    .handler(async ({ context: { db, session }, input, errors }) => {
      const cache = await getRedis();
      const sessionState = await startComicReadingSession({
        cache,
        comicId: input.comicId,
        db,
        role: session.user.role,
        userId: session.user.id,
      });

      if (!sessionState) {
        throw errors.NOT_FOUND();
      }

      return sessionState;
    }),

  update: protectedProcedure
    .use(slidingWindowRatelimitMiddleware(180, 60))
    .input(comicProgressUpdateSchema)
    .handler(async ({ context: { db, headers, session }, input }) => {
      const now = new Date();
      const cache = await getRedis();

      return trackComicPageView({
        cache,
        comicId: input.comicId,
        correlation: buildIntegrityCorrelationEvidence(headers),
        db,
        evidence: {
          documentVisible: input.documentVisible,
          visibleDurationMs: input.visibleDurationMs,
          visiblePercentage: input.visiblePercentage,
        },
        impersonated: Boolean(session.session?.impersonatedBy),
        now,
        page: input.page,
        readingSessionId: input.readingSessionId,
        role: session.user.role,
        timezone: input.timezone,
        userId: session.user.id,
      });
    }),
};
