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
  type PatronTier,
  type TAXONOMIES,
} from "@repo/shared/constants";
import {
  getAllowedRoles,
  getRoleLevel,
  ROLE_HIERARCHY,
  type Role,
} from "@repo/shared/permissions";
import * as z from "zod";
import {
  fixedWindowRatelimitMiddleware,
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
} from "../index";
import { buildProfileSummaries } from "../services/profile";

const RECENT_USERS_CACHE_TTL_SECONDS = 60 * 5; // 5 minutes

// TODO: improve recent user caching implementation
// const recentUserSchema = z.object({
//   id: z.string(),
//   name: z.string(),
//   image: z.string().nullable(),
//   role: z.string(),
// });

// const recentUsersListSchema = z.array(recentUserSchema);

export default {
  getBookmarks: protectedProcedure.handler(
    ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching bookmarks for user: ${session.user.id}`);

      return db.query.postBookmark.findMany({
        where: (b, { eq: equals }) => equals(b.userId, session.user.id),
        columns: {
          postId: true,
        },
      });
    }
  ),

  getBookmarksFull: protectedProcedure.handler(
    async ({ context: { db, session, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching full bookmarks for user: ${session.user.id}`);

      const likesAgg = db
        .select({
          postId: postLikes.postId,
          count: sql<number>`COUNT(*)`.as("likes_count"),
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          postId: postBookmark.postId,
          count: sql<number>`COUNT(*)`.as("favorites_count"),
        })
        .from(postBookmark)
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
          postId: postRating.postId,
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const result = await db
        .select({
          id: post.id,
          title: post.title,
          type: post.type,
          version: post.version,
          content: post.content,
          isWeekly: post.isWeekly,
          imageObjectKeys: post.imageObjectKeys,
          adsLinks: post.adsLinks,
          creatorName: post.creatorName,
          creatorLink: post.creatorLink,
          createdAt: post.createdAt,
          views: post.views,

          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,

          terms: sql<
            {
              id: string;
              name: string;
              taxonomy: (typeof TAXONOMIES)[number];
              color: string;
            }[]
          >`COALESCE(${termsAgg.terms}, '[]'::json)`,

          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          ratingCount: sql<number>`COALESCE(${ratingsAgg.ratingCount}, 0)`,
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

      return result;
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
          where: eq(patron.userId, session.user.id),
          columns: { tier: true, isActivePatron: true },
        });
        if (patronRecord?.isActivePatron) {
          tier = patronRecord.tier;
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
        where: (b, { eq: equals }) => equals(b.userId, session.user.id),
        columns: {
          postId: true,
        },
      });
    }
  ),

  // Cache recent users in KV to avoid hitting the database too often
  // This is a best-effort cache, so we don't need to be super strict about it
  // The list is not guaranteed to be perfectly up-to-date
  // We use a cutoff window to avoid caching users that are no longer active
  // We double the cutoff window to account for the fact that the cache might be stale
  // So we want to make sure we don't miss any users that are still considered "recent"
  // This is a trade-off between freshness and performance
  // In practice, this means that if a user was active within the last 10 minutes, they will be included in the list
  // Even if the cache is up to 5 minutes stale
  // This should be good enough for our use case

  getRecentUsers: publicProcedure.handler(
    async ({
      context: { db, session, ...ctx },
    }): Promise<Awaited<ReturnType<typeof buildProfileSummaries>>> => {
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

      logger?.debug(
        "Cache miss or invalid, fetching recent users from database"
      );

      const users = await db.query.user.findMany({
        where: (u, { gte }) =>
          gte(
            u.lastSeenAt,
            new Date(Date.now() - 1000 * RECENT_USERS_CACHE_TTL_SECONDS * 2)
          ),
        columns: {
          id: true,
        },
      });

      const summaries = await buildProfileSummaries(
        db,
        users.map((current) => current.id)
      );

      logger?.debug("Fetched recent profile summaries");
      return summaries;
    }
  ),

  getUser: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching user profile: ${input.id}`);

      const result = await db
        .select({
          id: user.id,
          name: user.name,
          role: user.role,
          image: user.image,
          createdAt: user.createdAt,
          patronTier: patron.tier,
          isActivePatron: patron.isActivePatron,
        })
        .from(user)
        .leftJoin(patron, eq(patron.userId, user.id))
        .where(eq(user.id, input.id))
        .limit(1);

      return result[0] ?? null;
    }),

  getUserBookmarks: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(30).default(12),
        offset: z.number().min(0).default(0),
      })
    )
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching public bookmarks for user: ${input.userId}`);

      const likesAgg = db
        .select({
          postId: postLikes.postId,
          count: sql<number>`COUNT(*)`.as("likes_count"),
        })
        .from(postLikes)
        .groupBy(postLikes.postId)
        .as("likes_agg");

      const favoritesAgg = db
        .select({
          postId: postBookmark.postId,
          count: sql<number>`COUNT(*)`.as("favorites_count"),
        })
        .from(postBookmark)
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
          postId: postRating.postId,
          averageRating:
            sql<number>`COALESCE(AVG(${postRating.rating})::float, 0)`.as(
              "average_rating"
            ),
          ratingCount: sql<number>`COUNT(*)::integer`.as("rating_count"),
        })
        .from(postRating)
        .groupBy(postRating.postId)
        .as("ratings_agg");

      const result = await db
        .select({
          id: post.id,
          title: post.title,
          version: post.version,
          type: post.type,
          imageObjectKeys: post.imageObjectKeys,
          createdAt: post.createdAt,
          views: post.views,

          favorites: sql<number>`COALESCE(${favoritesAgg.count}, 0)`,
          likes: sql<number>`COALESCE(${likesAgg.count}, 0)`,

          terms: sql<
            {
              id: string;
              name: string;
              taxonomy: (typeof TAXONOMIES)[number];
              color: string;
            }[]
          >`COALESCE(${termsAgg.terms}, '[]'::json)`,

          averageRating: sql<number>`COALESCE(${ratingsAgg.averageRating}, 0)`,
          ratingCount: sql<number>`COALESCE(${ratingsAgg.ratingCount}, 0)`,
        })
        .from(postBookmark)
        .innerJoin(post, eq(post.id, postBookmark.postId))
        .leftJoin(favoritesAgg, eq(favoritesAgg.postId, post.id))
        .leftJoin(likesAgg, eq(likesAgg.postId, post.id))
        .leftJoin(termsAgg, eq(termsAgg.postId, post.id))
        .leftJoin(ratingsAgg, eq(ratingsAgg.postId, post.id))
        .where(
          and(eq(post.status, "publish"), eq(postBookmark.userId, input.userId))
        )
        .limit(input.limit)
        .offset(input.offset);

      logger?.debug(
        `Fetched ${result.length} public bookmarks for user ${input.userId}`
      );

      return result;
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
          name: z.string().min(1),
          email: z.string().email(),
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
            name: input.name,
            email: input.email,
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
          userId: z.string(),
          role: z.enum(ROLE_HIERARCHY as [Role, ...Role[]]),
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
          where: eq(user.id, input.userId),
          columns: { role: true },
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
            userId: input.userId,
            role: input.role,
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
        time: sql<string>`t.d`,
        count: sql<number>`count(*)`,
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
        time: sql<string>`t.d`,
        count: sql<number>`count(*)`,
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
        role: user.role,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(user)
      .groupBy(user.role)
      .orderBy(sql`count(*) desc`);

    const patronsByTierPromise = db
      .select({
        tier: patron.tier,
        count: sql<number>`count(*)`.as("count"),
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
      registeredLastWeek,
      registeredAllTime,
      userCount: totalUsers,
      activePatronsCount: activePatronsCount[0]?.count ?? 0,
      verifiedEmailsCount: verifiedEmailsCount[0]?.count ?? 0,
      bannedUsersCount: bannedUsersCount[0]?.count ?? 0,
      newTodayCount: newTodayCount[0]?.count ?? 0,
      newThisWeekCount: newThisWeekCount[0]?.count ?? 0,
      usersByRole,
      patronsByTier,
      activeLastDay: activeLastDay[0]?.count ?? 0,
      activeLastWeek: activeLastWeek[0]?.count ?? 0,
      activeLastMonth: activeLastMonth[0]?.count ?? 0,
    };
  }),
};
