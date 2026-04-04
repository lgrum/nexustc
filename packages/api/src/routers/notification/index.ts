import {
  contentFollowSchema,
  notificationFeedSchema,
  notificationReadSchema,
} from "@repo/shared/schemas";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
  followContent,
  getFollowState,
  getFollowingOverview,
  getNotificationFeed,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationsRead,
  unfollowContent,
} from "../../services/notification";
import admin from "./admin";

export default {
  admin,

  followContent: protectedProcedure
    .input(contentFollowSchema)
    .handler(({ context: { db, session }, input }) =>
      followContent(db, {
        contentId: input.contentId,
        userId: session.user.id,
      })
    ),

  getFeed: protectedProcedure
    .input(notificationFeedSchema)
    .handler(({ context: { db, session }, input }) =>
      getNotificationFeed(db, {
        cursor: input.cursor,
        limit: input.limit,
        unreadOnly: input.unreadOnly,
        userId: session.user.id,
      })
    ),

  getFollowState: protectedProcedure
    .input(contentFollowSchema)
    .handler(({ context: { db, session }, input }) =>
      getFollowState(db, {
        contentId: input.contentId,
        userId: session.user.id,
      })
    ),

  getFollowing: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .handler(({ context: { db, session }, input }) =>
      getFollowingOverview(db, {
        limit: input.limit,
        userId: session.user.id,
      })
    ),

  getUnreadCount: protectedProcedure.handler(({ context: { db, session } }) =>
    getUnreadNotificationCount(db, session.user.id)
  ),

  markAllRead: protectedProcedure.handler(
    async ({ context: { db, session } }) => {
      await markAllNotificationsRead(db, session.user.id);
    }
  ),

  markRead: protectedProcedure
    .input(notificationReadSchema)
    .handler(({ context: { db, session }, input }) =>
      markNotificationsRead(db, {
        notificationIds: input.notificationIds,
        userId: session.user.id,
      })
    ),

  unfollowContent: protectedProcedure
    .input(contentFollowSchema)
    .handler(async ({ context: { db, session }, input }) => {
      await unfollowContent(db, {
        contentId: input.contentId,
        userId: session.user.id,
      });
    }),
};
