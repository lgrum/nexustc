import { getLogger } from "@orpc/experimental-pino";
import { auth } from "@repo/auth";
import { and, eq, sql } from "@repo/db";
import {
  patron,
  post,
  postBookmark,
  postLikes,
  postRating,
  term,
  termPostRelation,
  user,
} from "@repo/db/schema/app";
import {
  canBookmark,
  PATRON_TIER_PROFILE_BADGES,
} from "@repo/shared/constants";
import type { PatronTier, TAXONOMIES } from "@repo/shared/constants";
import {
  getAllowedRoles,
  getRoleLevel,
  ROLE_HIERARCHY,
} from "@repo/shared/permissions";
import type { Role } from "@repo/shared/permissions";
import * as z from "zod";

import {
  fixedWindowRatelimitMiddleware,
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
} from "../index";
import { attachComicCatalogProgress } from "../services/comic-progress";
import { createPostCoverImageObjectKeySelect } from "../utils/post-media";

const RECENT_USERS_WINDOW_SECONDS = 60 * 10;
const RECENT_USERS_LIMIT = 24;

export default {
  getBookmarks: protectedProcedure.handler(
    ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching bookmarks for user: ${session.user.id}`);

      return db.query.postBookmark.findMany({
        columns: {
          postId: true,
        },
        where: (b, { eq: equals }) => equals(b.userId, session.user.id),
      });
    }
  ),

  getBookmarksFull: protectedProcedure.handler(
    async ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching full bookmarks for user: ${session.user.id}`);

      const likesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("likes_count"),
          postId: postLikes.postId,
        })
        .from(postLikes)
        .innerJoin(user, eq(user.id, postLikes.userId))
        .where(sql`${user.banned} IS DISTINCT FROM true`)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("favorites_count"),
          postId: postBookmark.postId,
        })
        .from(postBookmark)
        .innerJoin(user, eq(user.id, postBookmark.userId))
        .where(sql`${user.banned} IS DISTINCT FROM true`)
        .groupBy(postBookmark.postId)
        .as("favorites_agg");

      const termsAgg = db
        .select({
          postId: termPostRelation.postId,
          terms: sql`
                  json_agg(
                    json_build_object(
                      'id', ${term.id},
                      'name', ${term.name},
                      'taxonomy', ${term.taxonomy},
                      'color', ${term.color}
                    )
                  )
                `.as("terms"),
        })
        .from(termPostRelation)
        .innerJoin(term, eq(term.id, termPostRelation.termId))
        .groupBy(termPostRelation.postId)
        .as("terms_agg");

      const ratingsAgg = db
        .select({
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
          postId: postRating.postId,
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .innerJoin(user, eq(user.id, postRating.userId))
        .where(sql`${user.banned} IS DISTINCT FROM true`)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const result = await db
        .select({
          adsLinks: post.adsLinks,
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          content: post.content,
          createdAt: post.createdAt,
          creatorLink: post.creatorLink,
          creatorName: post.creatorName,
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          id: post.id,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          isWeekly: post.isWeekly,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,
          ratingCount: sql<number>`COALESCE(${ratingsAgg.ratingCount}, 0)`,

          terms: sql<
            {
              id: string;
              name: string;
              taxonomy: (typeof TAXONOMIES)[number];
              color: string;
            }[]
          >`COALESCE(${termsAgg.terms}, '[]'::json)`,
          title: post.title,

          type: post.type,

          version: post.version,
          views: post.views,
        })
        .from(postBookmark)
        .innerJoin(post, eq(post.id, postBookmark.postId))
        .leftJoin(favoritesAgg, eq(favoritesAgg.postId, post.id))
        .leftJoin(likesAgg, eq(likesAgg.postId, post.id))
        .leftJoin(termsAgg, eq(termsAgg.postId, post.id))
        .leftJoin(ratingsAgg, eq(ratingsAgg.postId, post.id))
        .where(
          and(
            eq(post.status, "publish"),
            eq(postBookmark.userId, session.user.id)
          )
        );

      logger?.debug(
        `Fetched ${result.length} posts for user ${session.user.id} bookmarks`
      );

      return attachComicCatalogProgress(db, {
        items: result,
        userId: session.user.id,
      });
    }
  ),

  toggleBookmark: protectedProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 10, windowSeconds: 60 }))
    .input(z.object({ bookmarked: z.boolean(), postId: z.string() }))
    .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `User ${session.user.id} toggling bookmark for post ${input.postId} to ${input.bookmarked}`
      );

      let tier: PatronTier = "none";
      if (session?.user) {
        const patronRecord = await db.query.patron.findFirst({
          columns: { isActivePatron: true, tier: true },
          where: eq(patron.userId, session.user.id),
        });
        if (patronRecord?.isActivePatron) {
          ({ tier } = patronRecord);
        }
      }

      if (input.bookmarked) {
        const bookmarks = await db
          .select({ count: sql<number>`count(*)`.as("count") })
          .from(postBookmark)
          .where(eq(postBookmark.userId, session.user.id));
        const bookmarkCount = bookmarks[0]?.count ?? 0;

        if (
          !canBookmark(
            { role: session.user.role ?? "user", tier },
            bookmarkCount
          )
        ) {
          logger?.warn(
            `User ${session.user.id} has reached bookmark limit for tier ${tier}`
          );
          throw errors.FORBIDDEN({
            message: "Límite de favoritos alcanzado para tu nivel.",
          });
        }

        await db
          .insert(postBookmark)
          .values({
            postId: input.postId,
            userId: session.user.id,
          })
          .onConflictDoNothing();

        logger?.debug(
          `Bookmark added for user ${session.user.id} on post ${input.postId}`
        );
      } else {
        await db
          .delete(postBookmark)
          .where(
            and(
              eq(postBookmark.postId, input.postId),
              eq(postBookmark.userId, session.user.id)
            )
          );
        logger?.debug(
          `Bookmark removed for user ${session.user.id} on post ${input.postId}`
        );
      }
      logger?.info(
        `Bookmark toggle completed for user ${session.user.id} on post ${input.postId}`
      );
    }),

  toggleLike: protectedProcedure
    .use(fixedWindowRatelimitMiddleware({ limit: 10, windowSeconds: 60 }))
    .input(z.object({ liked: z.boolean(), postId: z.string() }))
    .handler(async ({ context: { db, session, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `User ${session.user.id} toggling like for post ${input.postId} to ${input.liked}`
      );

      if (input.liked) {
        await db
          .insert(postLikes)
          .values({
            postId: input.postId,
            userId: session.user.id,
          })
          .onConflictDoNothing();

        logger?.debug(
          `Like added for user ${session.user.id} on post ${input.postId}`
        );
      } else {
        await db
          .delete(postLikes)
          .where(
            and(
              eq(postLikes.postId, input.postId),
              eq(postLikes.userId, session.user.id)
            )
          );
        logger?.debug(
          `Like removed for user ${session.user.id} on post ${input.postId}`
        );
      }
      logger?.info(
        `Like toggle completed for user ${session.user.id} on post ${input.postId}`
      );
    }),

  getLikes: protectedProcedure.handler(
    ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching likes for user: ${session.user.id}`);

      return db.query.postLikes.findMany({
        columns: {
          postId: true,
        },
        where: (b, { eq: equals }) => equals(b.userId, session.user.id),
      });
    }
  ),

  getRecentUsers: publicProcedure.handler(
    async ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info("Fetching recent users list");

      const currentUser = session?.user;

      if (currentUser) {
        logger?.debug("Updating lastSeenAt for current user");
        await db
          .update(user)
          .set({ lastSeenAt: new Date() })
          .where(eq(user.id, currentUser.id));
      }

      logger?.debug("Fetching recent users from database");

      const now = new Date();
      const recentCutoff = new Date(
        Date.now() - 1000 * RECENT_USERS_WINDOW_SECONDS
      );

      const recentUsers = await db.query.user.findMany({
        columns: {
          avatarFallbackColor: true,
          id: true,
          image: true,
          name: true,
        },
        limit: RECENT_USERS_LIMIT,
        orderBy: (users, { desc }) => [desc(users.lastSeenAt)],
        where: (users, { and: all, gte: greaterThanOrEqual }) =>
          all(
            greaterThanOrEqual(users.lastSeenAt, recentCutoff),
            sql`${users.banned} IS DISTINCT FROM true`
          ),
        with: {
          patron: {
            columns: {
              isActivePatron: true,
              tier: true,
            },
          },
          profileRoleAssignments: {
            columns: {
              endsAt: true,
              id: true,
              isVisible: true,
              startsAt: true,
            },
            orderBy: (assignments, { desc }) => [desc(assignments.createdAt)],
            where: (
              assignments,
              {
                and: all,
                eq: equals,
                gte: greaterThanOrEqual,
                isNull,
                lte: lessThanOrEqual,
                or: any,
              }
            ) =>
              all(
                equals(assignments.isVisible, true),
                any(
                  isNull(assignments.startsAt),
                  lessThanOrEqual(assignments.startsAt, now)
                ),
                any(
                  isNull(assignments.endsAt),
                  greaterThanOrEqual(assignments.endsAt, now)
                )
              ),
            with: {
              roleDefinition: {
                columns: {
                  description: true,
                  id: true,
                  isActive: true,
                  isExclusive: true,
                  isVisible: true,
                  name: true,
                  priority: true,
                  slug: true,
                  visualConfig: true,
                },
                with: {
                  iconAsset: {
                    columns: {
                      isAnimated: true,
                      objectKey: true,
                    },
                  },
                  overlayAsset: {
                    columns: {
                      isAnimated: true,
                      objectKey: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      logger?.debug(`Fetched ${recentUsers.length} recent users`);
      return recentUsers.map(({ patron: patronRecord, ...recentUser }) => {
        const patronTier = patronRecord?.isActivePatron
          ? patronRecord.tier
          : ("none" as PatronTier);

        return {
          ...recentUser,
          patronBadge: PATRON_TIER_PROFILE_BADGES[patronTier],
          patronTier,
        };
      });
    }
  ),

  getUser: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching user profile: ${input.id}`);

      const result = await db
        .select({
          createdAt: user.createdAt,
          id: user.id,
          image: user.image,
          isActivePatron: patron.isActivePatron,
          name: user.name,
          patronTier: patron.tier,
          role: user.role,
        })
        .from(user)
        .leftJoin(patron, eq(patron.userId, user.id))
        .where(
          and(eq(user.id, input.id), sql`${user.banned} IS DISTINCT FROM true`)
        )
        .limit(1);

      return result[0] ?? null;
    }),

  getUserBookmarks: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(30).default(12),
        offset: z.number().min(0).default(0),
        userId: z.string(),
      })
    )
    .handler(async ({ context: { db, session, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching public bookmarks for user: ${input.userId}`);

      const likesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("likes_count"),
          postId: postLikes.postId,
        })
        .from(postLikes)
        .innerJoin(user, eq(user.id, postLikes.userId))
        .where(sql`${user.banned} IS DISTINCT FROM true`)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          count: sql<number>`COUNT(*)`.as("favorites_count"),
          postId: postBookmark.postId,
        })
        .from(postBookmark)
        .innerJoin(user, eq(user.id, postBookmark.userId))
        .where(sql`${user.banned} IS DISTINCT FROM true`)
        .groupBy(postBookmark.postId)
        .as("favorites_agg");

      const termsAgg = db
        .select({
          postId: termPostRelation.postId,
          terms: sql`
                  json_agg(
                    json_build_object(
                      'id', ${term.id},
                      'name', ${term.name},
                      'taxonomy', ${term.taxonomy},
                      'color', ${term.color}
                    )
                  )
                `.as("terms"),
        })
        .from(termPostRelation)
        .innerJoin(term, eq(term.id, termPostRelation.termId))
        .groupBy(termPostRelation.postId)
        .as("terms_agg");

      const ratingsAgg = db
        .select({
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
          postId: postRating.postId,
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .innerJoin(user, eq(user.id, postRating.userId))
        .where(sql`${user.banned} IS DISTINCT FROM true`)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const result = await db
        .select({
          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          createdAt: post.createdAt,
          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          id: post.id,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,
          ratingCount: sql<number>`COALESCE(${ratingsAgg.ratingCount}, 0)`,

          terms: sql<
            {
              id: string;
              name: string;
              taxonomy: (typeof TAXONOMIES)[number];
              color: string;
            }[]
          >`COALESCE(${termsAgg.terms}, '[]'::json)`,
          title: post.title,

          type: post.type,

          version: post.version,
          views: post.views,
        })
        .from(postBookmark)
        .innerJoin(user, eq(user.id, postBookmark.userId))
        .innerJoin(post, eq(post.id, postBookmark.postId))
        .leftJoin(favoritesAgg, eq(favoritesAgg.postId, post.id))
        .leftJoin(likesAgg, eq(likesAgg.postId, post.id))
        .leftJoin(termsAgg, eq(termsAgg.postId, post.id))
        .leftJoin(ratingsAgg, eq(ratingsAgg.postId, post.id))
        .where(
          and(
            eq(post.status, "publish"),
            eq(postBookmark.userId, input.userId),
            sql`${user.banned} IS DISTINCT FROM true`
          )
        )
        .limit(input.limit)
        .offset(input.offset);

      logger?.debug(
        `Fetched ${result.length} public bookmarks for user ${input.userId}`
      );

      return attachComicCatalogProgress(db, {
        items: result,
        userId: session?.user.id,
      });
    }),

  getDashboardList: permissionProcedure({
    user: ["list"],
  }).handler(({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching user dashboard list");

    return db.query.user.findMany({
      columns: {
        id: true,
        name: true,
        role: true,
      },
    });
  }),

  admin: {
    createUser: permissionProcedure({
      user: ["create"],
    })
      .input(
        z.object({
          email: z.string().email(),
          name: z.string().min(1),
          password: z.string().min(8),
          role: z.enum(ROLE_HIERARCHY as [Role, ...Role[]]),
        })
      )
      .handler(async ({ context: { session, ...ctx }, input, errors }) => {
        const logger = getLogger(ctx);
        const actorRole = session.user.role as Role;
        const allowed = getAllowedRoles(actorRole);

        if (!allowed.includes(input.role)) {
          logger?.warn(
            `User ${session.user.id} (${actorRole}) attempted to create user with role ${input.role}`
          );
          throw errors.FORBIDDEN({
            message: "No puedes asignar un rol igual o superior al tuyo.",
          });
        }

        logger?.info(
          `User ${session.user.id} creating new user with role ${input.role}`
        );

        const created = await auth.api.createUser({
          body: {
            email: input.email,
            name: input.name,
            password: input.password,
            role: input.role,
          },
        });

        return { id: created.user.id };
      }),

    setRole: permissionProcedure({
      user: ["set-role"],
    })
      .input(
        z.object({
          role: z.enum(ROLE_HIERARCHY as [Role, ...Role[]]),
          userId: z.string(),
        })
      )
      .handler(async ({ context: { db, session, ...ctx }, input, errors }) => {
        const logger = getLogger(ctx);
        const actorRole = session.user.role as Role;
        const actorLevel = getRoleLevel(actorRole);
        const allowed = getAllowedRoles(actorRole);

        if (!allowed.includes(input.role)) {
          logger?.warn(
            `User ${session.user.id} (${actorRole}) attempted to set role ${input.role}`
          );
          throw errors.FORBIDDEN({
            message: "No puedes asignar un rol igual o superior al tuyo.",
          });
        }

        const targetUser = await db.query.user.findFirst({
          columns: { role: true },
          where: eq(user.id, input.userId),
        });

        if (!targetUser) {
          throw errors.NOT_FOUND({ message: "Usuario no encontrado." });
        }

        const targetCurrentLevel = getRoleLevel(
          (targetUser.role ?? "user") as Role
        );

        if (targetCurrentLevel >= actorLevel) {
          logger?.warn(
            `User ${session.user.id} (${actorRole}) attempted to change role of user ${input.userId} with role ${targetUser.role}`
          );
          throw errors.FORBIDDEN({
            message:
              "No puedes cambiar el rol de un usuario con rol igual o superior al tuyo.",
          });
        }

        logger?.info(
          `User ${session.user.id} setting role of ${input.userId} to ${input.role}`
        );

        await auth.api.setRole({
          body: {
            role: input.role,
            userId: input.userId,
          },
          headers: ctx.headers,
        });

        return { success: true };
      }),
  },

  getDashboard: permissionProcedure({
    user: ["list"],
  }).handler(async ({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching user dashboard analytics");

    const registeredLastWeekPromise = db
      .select({
        count: sql<number>`count(*)`,
        time: sql<string>`t.d`,
      })
      .from(
        db
          .select({
            hour: sql`date_trunc('hour', ${user.createdAt} AT TIME ZONE 'UTC')`.as(
              "d"
            ),
          })
          .from(user)
          .where(sql`${user.createdAt} >= now() - interval '7 days'`)
          .as("t")
      )
      .groupBy(sql`t.d`)
      .orderBy(sql`t.d`);

    const registeredAllTimePromise = db
      .select({
        count: sql<number>`count(*)`,
        time: sql<string>`t.d`,
      })
      .from(
        db
          .select({
            day: sql`date(${user.createdAt} AT TIME ZONE 'UTC')`.as("d"),
          })
          .from(user)
          .as("t")
      )
      .groupBy(sql`t.d`)
      .orderBy(sql`t.d`);

    const userCountPromise = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(user);

    const activePatronsCountPromise = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(patron)
      .where(eq(patron.isActivePatron, true));

    const verifiedEmailsCountPromise = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(user)
      .where(eq(user.emailVerified, true));

    const bannedUsersCountPromise = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(user)
      .where(eq(user.banned, true));

    const newTodayCountPromise = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(user)
      .where(sql`${user.createdAt} >= now() - interval '1 day'`);

    const newThisWeekCountPromise = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(user)
      .where(sql`${user.createdAt} >= now() - interval '7 days'`);

    const usersByRolePromise = db
      .select({
        count: sql<number>`count(*)`.as("count"),
        role: user.role,
      })
      .from(user)
      .groupBy(user.role)
      .orderBy(sql`count(*) desc`);

    const patronsByTierPromise = db
      .select({
        count: sql<number>`count(*)`.as("count"),
        tier: patron.tier,
      })
      .from(patron)
      .where(eq(patron.isActivePatron, true))
      .groupBy(patron.tier)
      .orderBy(sql`count(*) desc`);

    const activeLastDayPromise = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(user)
      .where(sql`${user.lastSeenAt} >= now() - interval '1 day'`);

    const activeLastWeekPromise = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(user)
      .where(sql`${user.lastSeenAt} >= now() - interval '7 days'`);

    const activeLastMonthPromise = db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(user)
      .where(sql`${user.lastSeenAt} >= now() - interval '30 days'`);

    const [
      registeredLastWeek,
      registeredAllTime,
      userCount,
      activePatronsCount,
      verifiedEmailsCount,
      bannedUsersCount,
      newTodayCount,
      newThisWeekCount,
      usersByRole,
      patronsByTier,
      activeLastDay,
      activeLastWeek,
      activeLastMonth,
    ] = await Promise.all([
      registeredLastWeekPromise,
      registeredAllTimePromise,
      userCountPromise,
      activePatronsCountPromise,
      verifiedEmailsCountPromise,
      bannedUsersCountPromise,
      newTodayCountPromise,
      newThisWeekCountPromise,
      usersByRolePromise,
      patronsByTierPromise,
      activeLastDayPromise,
      activeLastWeekPromise,
      activeLastMonthPromise,
    ]);

    const totalUsers = userCount[0]?.count ?? 0;
    logger?.debug(
      `Dashboard: Total users=${totalUsers}, Last week entries=${registeredLastWeek.length}, All time entries=${registeredAllTime.length}`
    );

    return {
      activeLastDay: activeLastDay[0]?.count ?? 0,
      activeLastMonth: activeLastMonth[0]?.count ?? 0,
      activeLastWeek: activeLastWeek[0]?.count ?? 0,
      activePatronsCount: activePatronsCount[0]?.count ?? 0,
      bannedUsersCount: bannedUsersCount[0]?.count ?? 0,
      newThisWeekCount: newThisWeekCount[0]?.count ?? 0,
      newTodayCount: newTodayCount[0]?.count ?? 0,
      patronsByTier,
      registeredAllTime,
      registeredLastWeek,
      userCount: totalUsers,
      usersByRole,
      verifiedEmailsCount: verifiedEmailsCount[0]?.count ?? 0,
    };
  }),
};
