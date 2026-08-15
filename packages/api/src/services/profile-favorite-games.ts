import { and, eq, ilike, inArray } from "@repo/db";
import type { db as database } from "@repo/db";
import { patron, post, profileShowcaseConfig, user } from "@repo/db/schema/app";
import type { PatronTier } from "@repo/shared/constants";
import { getPatronTierRank } from "@repo/shared/constants";
import {
  FAVORITE_GAMES_CAPACITY_LADDER,
  FAVORITE_GAMES_MAX_SAVED,
  FAVORITE_GAMES_SEARCH_LIMIT,
} from "@repo/shared/profile-customization";

import { publicCatalogVisibilityCondition } from "../utils/early-access";
import { createPostCoverImageObjectKeySelect } from "../utils/post-media";
import { userIsNotActivelyBanned } from "../utils/user-ban";
import { migrateFavoriteGamesPayload } from "./profile-showcase-registry";

type Database = typeof database;
type ReadDatabase = Pick<Database, "query" | "select">;

export function resolveFavoriteGamesCapacity(
  tier: PatronTier,
  role: string,
  ladder = FAVORITE_GAMES_CAPACITY_LADDER
) {
  if (["owner", "admin", "moderator"].includes(role)) {
    return FAVORITE_GAMES_MAX_SAVED;
  }
  const rank = getPatronTierRank(tier);
  return (
    ladder.find(({ minimumTier }) => getPatronTierRank(minimumTier) <= rank)
      ?.capacity ?? 1
  );
}

export async function loadFavoriteGamesEntitlement(
  db: ReadDatabase,
  userId: string
) {
  const [account, membership] = await Promise.all([
    db.query.user.findFirst({
      columns: { role: true },
      where: eq(user.id, userId),
    }),
    db.query.patron.findFirst({
      columns: { isActivePatron: true, tier: true },
      where: eq(patron.userId, userId),
    }),
  ]);
  return {
    capacity: resolveFavoriteGamesCapacity(
      membership?.isActivePatron ? membership.tier : "none",
      account?.role ?? "user"
    ),
    exists: Boolean(account),
  };
}

export async function loadPublicGameProjections(
  db: ReadDatabase,
  gameIds: string[]
) {
  const boundedIds = [...new Set(gameIds)].slice(0, FAVORITE_GAMES_MAX_SAVED);
  if (boundedIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      coverImageObjectKey: createPostCoverImageObjectKeySelect(),
      id: post.id,
      slug: post.slug,
      title: post.title,
    })
    .from(post)
    .innerJoin(user, eq(user.id, post.authorId))
    .where(
      and(
        inArray(post.id, boundedIds),
        eq(post.status, "publish"),
        eq(post.type, "post"),
        publicCatalogVisibilityCondition(),
        userIsNotActivelyBanned()
      )
    )
    .limit(FAVORITE_GAMES_MAX_SAVED);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return boundedIds.flatMap((id) => {
    const game = byId.get(id);
    return game ? [game] : [];
  });
}

export function searchPublicFavoriteGames(db: Database, search = "") {
  return db
    .select({
      coverImageObjectKey: createPostCoverImageObjectKeySelect(),
      id: post.id,
      slug: post.slug,
      title: post.title,
    })
    .from(post)
    .innerJoin(user, eq(user.id, post.authorId))
    .where(
      and(
        eq(post.status, "publish"),
        eq(post.type, "post"),
        publicCatalogVisibilityCondition(),
        userIsNotActivelyBanned(),
        search.trim() ? ilike(post.title, `%${search.trim()}%`) : undefined
      )
    )
    .orderBy(post.title, post.id)
    .limit(FAVORITE_GAMES_SEARCH_LIMIT);
}

export async function loadFavoriteGamesEditorState(
  db: Database,
  userId: string
) {
  const [row, entitlement, suggestions] = await Promise.all([
    db.query.profileShowcaseConfig.findFirst({
      where: and(
        eq(profileShowcaseConfig.userId, userId),
        eq(profileShowcaseConfig.typeKey, "favorite-games")
      ),
    }),
    loadFavoriteGamesEntitlement(db, userId),
    searchPublicFavoriteGames(db),
  ]);
  let gameIds: string[] = [];
  if (row) {
    try {
      ({ gameIds } = migrateFavoriteGamesPayload(
        row.payloadSchemaVersion,
        row.payload
      ));
    } catch {
      gameIds = [];
    }
  }
  const games = await loadPublicGameProjections(db, gameIds);
  const byId = new Map(games.map((game) => [game.id, game]));
  return {
    capacity: entitlement.capacity,
    selected: gameIds.map((id, index) => ({
      active: index < entitlement.capacity,
      game: byId.get(id) ?? null,
      id,
    })),
    suggestions,
  };
}

export async function loadPublicFavoriteGamesShowcase(
  db: Database,
  userId: string
) {
  const [row, entitlement] = await Promise.all([
    db.query.profileShowcaseConfig.findFirst({
      where: and(
        eq(profileShowcaseConfig.userId, userId),
        eq(profileShowcaseConfig.typeKey, "favorite-games"),
        eq(profileShowcaseConfig.enabled, true)
      ),
    }),
    loadFavoriteGamesEntitlement(db, userId),
  ]);
  if (!(row && entitlement.exists)) {
    return [];
  }
  try {
    const { gameIds } = migrateFavoriteGamesPayload(
      row.payloadSchemaVersion,
      row.payload
    );
    return loadPublicGameProjections(
      db,
      gameIds.slice(0, entitlement.capacity)
    );
  } catch {
    return [];
  }
}
