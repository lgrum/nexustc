import { getLogger } from "@orpc/experimental-pino";
import { and, asc, eq, inArray } from "@repo/db";
import {
  engagementQuestion,
  engagementQuestionIncompatibleTagRelation,
  engagementQuestionTagRelation,
  term,
} from "@repo/db/schema/app";
import {
  engagementQuestionCreateSchema,
  engagementQuestionUpdateSchema,
} from "@repo/shared/schemas";
import z from "zod";

import type { Context } from "../context";
import { permissionProcedure } from "../index";

async function assertTagTermsExist(db: Context["db"], tagTermIds: string[]) {
  if (tagTermIds.length === 0) {
    return;
  }

  const tagTerms = await db.query.term.findMany({
    columns: { id: true },
    where: and(inArray(term.id, tagTermIds), eq(term.taxonomy, "tag")),
  });

  if (tagTerms.length !== tagTermIds.length) {
    return null;
  }

  return tagTerms;
}

async function replaceQuestionTagRelations(
  db: Pick<Context["db"], "delete" | "insert">,
  questionId: string,
  tagTermIds: string[]
) {
  await db
    .delete(engagementQuestionTagRelation)
    .where(eq(engagementQuestionTagRelation.engagementQuestionId, questionId));

  if (tagTermIds.length === 0) {
    return;
  }

  await db.insert(engagementQuestionTagRelation).values(
    tagTermIds.map((tagTermId) => ({
      engagementQuestionId: questionId,
      termId: tagTermId,
    }))
  );
}

async function replaceQuestionIncompatibleTagRelations(
  db: Pick<Context["db"], "delete" | "insert">,
  questionId: string,
  incompatibleTagTermIds: string[]
) {
  await db
    .delete(engagementQuestionIncompatibleTagRelation)
    .where(
      eq(
        engagementQuestionIncompatibleTagRelation.engagementQuestionId,
        questionId
      )
    );

  if (incompatibleTagTermIds.length === 0) {
    return;
  }

  await db.insert(engagementQuestionIncompatibleTagRelation).values(
    incompatibleTagTermIds.map((tagTermId) => ({
      engagementQuestionId: questionId,
      termId: tagTermId,
    }))
  );
}

export default {
  create: permissionProcedure({ posts: ["create"] })
    .input(engagementQuestionCreateSchema)
    .handler(async ({ context: { db, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        input.isGlobal
          ? "Creating global engagement question"
          : `Creating engagement question for tags ${input.tagTermIds.join(", ")}`
      );

      const tagTermIds = input.isGlobal ? [] : input.tagTermIds;
      const incompatibleTagTermIds = input.isGlobal
        ? input.incompatibleTagTermIds
        : [];
      const tagTermIdsToValidate = [
        ...new Set([...tagTermIds, ...incompatibleTagTermIds]),
      ];
      if (!(input.isGlobal || tagTermIds.length > 0)) {
        throw errors.BAD_REQUEST();
      }

      if (tagTermIdsToValidate.length > 0) {
        const tagTerms = await assertTagTermsExist(db, tagTermIdsToValidate);
        if (!tagTerms) {
          throw errors.NOT_FOUND();
        }
      }

      const createdQuestion = await db.transaction(async (tx) => {
        const [question] = await tx
          .insert(engagementQuestion)
          .values({
            isActive: input.isActive,
            isGlobal: input.isGlobal,
            locale: input.locale,
            tagTermId: tagTermIds[0] ?? null,
            text: input.text,
          })
          .returning({ id: engagementQuestion.id });

        if (!question) {
          throw errors.INTERNAL_SERVER_ERROR();
        }

        await replaceQuestionTagRelations(tx, question.id, tagTermIds);
        await replaceQuestionIncompatibleTagRelations(
          tx,
          question.id,
          incompatibleTagTermIds
        );

        return question;
      });

      return createdQuestion;
    }),

  delete: permissionProcedure({ posts: ["delete"] })
    .input(
      z.object({
        id: z.string(),
      })
    )
    .handler(async ({ context: { db }, input }) => {
      await db
        .delete(engagementQuestion)
        .where(eq(engagementQuestion.id, input.id));
    }),

  edit: permissionProcedure({ posts: ["update"] })
    .input(engagementQuestionUpdateSchema)
    .handler(async ({ context: { db, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(`Editing engagement question ${input.id}`);

      const tagTermIds = input.isGlobal ? [] : input.tagTermIds;
      const incompatibleTagTermIds = input.isGlobal
        ? input.incompatibleTagTermIds
        : [];
      const tagTermIdsToValidate = [
        ...new Set([...tagTermIds, ...incompatibleTagTermIds]),
      ];
      if (!(input.isGlobal || tagTermIds.length > 0)) {
        throw errors.BAD_REQUEST();
      }

      if (tagTermIdsToValidate.length > 0) {
        const tagTerms = await assertTagTermsExist(db, tagTermIdsToValidate);
        if (!tagTerms) {
          throw errors.NOT_FOUND();
        }
      }

      const updatedQuestion = await db.transaction(async (tx) => {
        const [question] = await tx
          .update(engagementQuestion)
          .set({
            isActive: input.isActive,
            isGlobal: input.isGlobal,
            locale: input.locale,
            tagTermId: tagTermIds[0] ?? null,
            text: input.text,
          })
          .where(eq(engagementQuestion.id, input.id))
          .returning({ id: engagementQuestion.id });

        if (!question) {
          throw errors.NOT_FOUND();
        }

        await replaceQuestionTagRelations(tx, question.id, tagTermIds);
        await replaceQuestionIncompatibleTagRelations(
          tx,
          question.id,
          incompatibleTagTermIds
        );

        return question;
      });

      return updatedQuestion;
    }),

  getDashboardData: permissionProcedure({ posts: ["list"] }).handler(
    async ({ context: { db, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info("Fetching engagement question dashboard data");

      const [tagTerms, rawQuestions] = await Promise.all([
        db.query.term.findMany({
          columns: {
            color: true,
            id: true,
            name: true,
          },
          orderBy: [asc(term.name)],
          where: eq(term.taxonomy, "tag"),
        }),
        db.query.engagementQuestion.findMany({
          orderBy: (table, { asc: ascSql, desc }) => [
            desc(table.isGlobal),
            desc(table.isActive),
            ascSql(table.tagTermId),
            ascSql(table.createdAt),
          ],
          with: {
            incompatibleTagRelations: {
              with: {
                term: {
                  columns: {
                    color: true,
                    id: true,
                    name: true,
                  },
                },
              },
            },
            tagRelations: {
              with: {
                term: {
                  columns: {
                    color: true,
                    id: true,
                    name: true,
                  },
                },
              },
            },
            tagTerm: {
              columns: {
                color: true,
                id: true,
                name: true,
              },
            },
          },
        }),
      ]);

      const questions = rawQuestions.map(
        ({ incompatibleTagRelations, tagRelations, tagTerm, ...question }) => {
          const relatedTagTerms = tagRelations
            .map((relation) => relation.term)
            .toSorted((left, right) =>
              left.name.localeCompare(right.name, "es")
            );
          const incompatibleTagTerms = incompatibleTagRelations
            .map((relation) => relation.term)
            .toSorted((left, right) =>
              left.name.localeCompare(right.name, "es")
            );
          const questionTagTerms =
            relatedTagTerms.length > 0
              ? relatedTagTerms
              : tagTerm
                ? [tagTerm]
                : [];

          return {
            ...question,
            incompatibleTagTermIds: incompatibleTagTerms.map(
              (incompatibleTagTerm) => incompatibleTagTerm.id
            ),
            incompatibleTagTerms,
            tagTerm,
            tagTermIds: questionTagTerms.map(
              (questionTagTerm) => questionTagTerm.id
            ),
            tagTerms: questionTagTerms,
          };
        }
      );

      return { questions, tagTerms };
    }
  ),

  toggleActive: permissionProcedure({ posts: ["update"] })
    .input(
      z.object({
        id: z.string(),
        isActive: z.boolean(),
      })
    )
    .handler(async ({ context: { db }, input, errors }) => {
      const updated = await db
        .update(engagementQuestion)
        .set({ isActive: input.isActive })
        .where(eq(engagementQuestion.id, input.id))
        .returning({ id: engagementQuestion.id });

      if (updated.length === 0) {
        throw errors.NOT_FOUND();
      }
    }),
};
