import type { db as database } from "@repo/db";
import { and, eq } from "@repo/db";
import { term, termPostRelation } from "@repo/db/schema/app";

import { resolveEngagementPrompts } from "./engagement-prompts";

type Database = typeof database;

export type CommentEngagementSelection = {
  id: string;
  source: "manual" | "tag";
};

export async function getResolvedEngagementPromptsForPost(
  db: Database,
  postId: string
) {
  const manualOverrides = await db.query.postEngagementOverride.findMany({
    columns: {
      id: true,
      text: true,
    },
    orderBy: (table, { asc }) => [asc(table.sortOrder), asc(table.createdAt)],
    where: (table, { and: andWhere, eq: equals }) =>
      andWhere(equals(table.postId, postId), equals(table.isActive, true)),
  });

  if (manualOverrides.length > 0) {
    return resolveEngagementPrompts(manualOverrides, []);
  }

  const tagTerms = await db
    .select({
      id: term.id,
    })
    .from(termPostRelation)
    .innerJoin(term, eq(term.id, termPostRelation.termId))
    .where(and(eq(termPostRelation.postId, postId), eq(term.taxonomy, "tag")));

  const tagTermIds = tagTerms.map((tagTerm) => tagTerm.id);
  const automaticQuestions = await db.query.engagementQuestion.findMany({
    columns: {
      id: true,
      tagTermId: true,
      text: true,
    },
    where: (
      table,
      { and: andWhere, eq: equals, inArray: inArrayWhere, or: orWhere }
    ) => {
      if (tagTermIds.length === 0) {
        return andWhere(
          equals(table.isActive, true),
          equals(table.isGlobal, true)
        );
      }

      return andWhere(
        equals(table.isActive, true),
        orWhere(
          equals(table.isGlobal, true),
          inArrayWhere(table.tagTermId, tagTermIds)
        )
      );
    },
  });

  return resolveEngagementPrompts([], automaticQuestions);
}

export function resolveCommentEngagementSelection(
  prompts: Awaited<ReturnType<typeof getResolvedEngagementPromptsForPost>>,
  selection?: CommentEngagementSelection
) {
  if (!selection) {
    return null;
  }

  return (
    prompts.find(
      (prompt) =>
        prompt.id === selection.id && prompt.source === selection.source
    ) ?? null
  );
}
