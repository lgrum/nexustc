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
    .handler(async ({ context: { db, session }, input }) => {
      const cache = await getRedis();

      return trackComicPageView({
        cache,
        comicId: input.comicId,
        db,
        page: input.page,
        readingSessionId: input.readingSessionId,
        userId: session.user.id,
      });
    }),
};
