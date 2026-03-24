import { getLogger } from "@orpc/experimental-pino";
import { and, asc, eq } from "@repo/db";
import { engagementQuestion, term } from "@repo/db/schema/app";
import {
  engagementQuestionCreateSchema,
  engagementQuestionUpdateSchema,
} from "@repo/shared/schemas";
import z from "zod";

import type { Context } from "../context";
import { permissionProcedure } from "../index";

async function assertTagTermExists(db: Context["db"], tagTermId: string) {
  const tagTerm = await db.query.term.findFirst({
    columns: { id: true },
    where: and(eq(term.id, tagTermId), eq(term.taxonomy, "tag")),
  });

  return tagTerm;
}

export default {
  create: permissionProcedure({ posts: ["create"] })
    .input(engagementQuestionCreateSchema)
    .handler(async ({ context: { db, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info(
        input.isGlobal
          ? "Creating global engagement question"
          : `Creating engagement question for tag ${input.tagTermId}`
      );

      const tagTermId = input.isGlobal ? null : (input.tagTermId ?? null);
      if (!input.isGlobal) {
        if (!tagTermId) {
          throw errors.BAD_REQUEST();
        }

        const tagTerm = await assertTagTermExists(db, tagTermId);
        if (!tagTerm) {
          throw errors.NOT_FOUND();
        }
      }

      const [createdQuestion] = await db
        .insert(engagementQuestion)
        .values({
          isActive: input.isActive,
          isGlobal: input.isGlobal,
          locale: input.locale,
          tagTermId,
          text: input.text,
        })
        .returning({ id: engagementQuestion.id });

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

      const tagTermId = input.isGlobal ? null : (input.tagTermId ?? null);
      if (!input.isGlobal) {
        if (!tagTermId) {
          throw errors.BAD_REQUEST();
        }

        const tagTerm = await assertTagTermExists(db, tagTermId);
        if (!tagTerm) {
          throw errors.NOT_FOUND();
        }
      }

      const [updatedQuestion] = await db
        .update(engagementQuestion)
        .set({
          isActive: input.isActive,
          isGlobal: input.isGlobal,
          locale: input.locale,
          tagTermId,
          text: input.text,
        })
        .where(eq(engagementQuestion.id, input.id))
        .returning({ id: engagementQuestion.id });

      if (!updatedQuestion) {
        throw errors.NOT_FOUND();
      }

      return updatedQuestion;
    }),

  getDashboardData: permissionProcedure({ posts: ["list"] }).handler(
    async ({ context: { db, ...ctx } }) => {
      const logger = getLogger(ctx);
      logger?.info("Fetching engagement question dashboard data");

      const [tagTerms, questions] = await Promise.all([
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
