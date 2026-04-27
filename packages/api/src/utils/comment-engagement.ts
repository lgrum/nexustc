import type { db as database } from "@repo/db";
import { and, eq, inArray } from "@repo/db";
import {
  engagementQuestion,
  engagementQuestionTagRelation,
  term,
  termPostRelation,
} from "@repo/db/schema/app";

import {
  resolveEngagementPrompts,
  resolveSelectableEngagementPrompts,
} from "./engagement-prompts";
import type { EngagementPrompt } from "./engagement-prompts";

type Database = typeof database;

export type CommentEngagementSelection = {
  id: string;
  source: "manual" | "tag";
};

export function isGlobalEngagementQuestionCompatible(
  incompatibleTagTermIds: string[],
  postTagTermIds: string[]
) {
  return !incompatibleTagTermIds.some((tagTermId) =>
    postTagTermIds.includes(tagTermId)
  );
}

export async function getResolvedEngagementPromptsForPost(
  db: Database,
  postId: string
) {
  const { automaticQuestions, manualOverrides } =
    await getEngagementPromptCandidatesForPost(db, postId);

  return resolveEngagementPrompts(manualOverrides, automaticQuestions);
}

export async function getSelectableEngagementPromptsForPost(
  db: Database,
  postId: string
) {
  const { automaticQuestions, manualOverrides } =
    await getEngagementPromptCandidatesForPost(db, postId);

  return resolveSelectableEngagementPrompts(
    manualOverrides,
    automaticQuestions
  );
}

async function getEngagementPromptCandidatesForPost(
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

  const tagTerms = await db
    .select({
      id: term.id,
    })
    .from(termPostRelation)
    .innerJoin(term, eq(term.id, termPostRelation.termId))
    .where(and(eq(termPostRelation.postId, postId), eq(term.taxonomy, "tag")));

  const tagTermIds = tagTerms.map((tagTerm) => tagTerm.id);
  const globalQuestions = await db.query.engagementQuestion.findMany({
    columns: {
      id: true,
      text: true,
    },
    where: (table, { and: andWhere, eq: equals }) =>
      andWhere(equals(table.isActive, true), equals(table.isGlobal, true)),
    with: {
      incompatibleTagRelations: {
        columns: {
          termId: true,
        },
      },
    },
  });
  const taggedQuestions =
    tagTermIds.length === 0
      ? []
      : await db
          .select({
            id: engagementQuestion.id,
            tagTermId: engagementQuestionTagRelation.termId,
            text: engagementQuestion.text,
          })
          .from(engagementQuestionTagRelation)
          .innerJoin(
            engagementQuestion,
            eq(
              engagementQuestion.id,
              engagementQuestionTagRelation.engagementQuestionId
            )
          )
          .where(
            and(
              eq(engagementQuestion.isActive, true),
              inArray(engagementQuestionTagRelation.termId, tagTermIds)
            )
          );
  const automaticQuestions = [
    ...globalQuestions
      .filter((question) =>
        isGlobalEngagementQuestionCompatible(
          question.incompatibleTagRelations.map((relation) => relation.termId),
          tagTermIds
        )
      )
      .map((question) => ({
        id: question.id,
        tagTermId: null,
        text: question.text,
      })),
    ...taggedQuestions,
  ];

  return {
    automaticQuestions,
    manualOverrides,
  };
}

export function resolveCommentEngagementSelection(
  prompts: EngagementPrompt[],
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
