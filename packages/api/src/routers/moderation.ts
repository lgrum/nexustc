import { getLogger } from "@orpc/experimental-pino";
import { asc, eq, forbiddenContentRule } from "@repo/db";
import {
  forbiddenContentRuleCreateSchema,
  forbiddenContentRuleDeleteSchema,
  forbiddenContentRuleUpdateSchema,
} from "@repo/shared/schemas";

import { permissionProcedure } from "../index";
import { normalizeForbiddenContentValue } from "../utils/forbidden-content";

export default {
  createForbiddenContentRules: permissionProcedure({ moderation: ["create"] })
    .input(forbiddenContentRuleCreateSchema)
    .handler(async ({ context: { db, session, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Creating ${input.values.length} forbidden content rules of kind ${input.kind}`
      );

      const ruleMap = new Map<string, string>();

      for (const value of input.values) {
        const normalizedValue = normalizeForbiddenContentValue(
          value,
          input.kind
        );

        if (normalizedValue.length > 0) {
          ruleMap.set(normalizedValue, value);
        }
      }

      if (ruleMap.size === 0) {
        return { created: 0 };
      }

      await db
        .insert(forbiddenContentRule)
        .values(
          [...ruleMap.entries()].map(([normalizedValue, value]) => ({
            createdBy: session.user.id,
            isActive: true,
            kind: input.kind,
            normalizedValue,
            updatedBy: session.user.id,
            value,
          }))
        )
        .onConflictDoUpdate({
          set: {
            isActive: true,
            updatedAt: new Date(),
            updatedBy: session.user.id,
          },
          target: [
            forbiddenContentRule.kind,
            forbiddenContentRule.normalizedValue,
          ],
        });

      return { created: ruleMap.size };
    }),

  deleteForbiddenContentRule: permissionProcedure({ moderation: ["delete"] })
    .input(forbiddenContentRuleDeleteSchema)
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Deleting forbidden content rule ${input.id}`);

      await db
        .delete(forbiddenContentRule)
        .where(eq(forbiddenContentRule.id, input.id));

      return { success: true };
    }),

  listForbiddenContentRules: permissionProcedure({
    moderation: ["list"],
  }).handler(({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Listing forbidden content rules");

    return db
      .select({
        createdAt: forbiddenContentRule.createdAt,
        id: forbiddenContentRule.id,
        isActive: forbiddenContentRule.isActive,
        kind: forbiddenContentRule.kind,
        updatedAt: forbiddenContentRule.updatedAt,
        value: forbiddenContentRule.value,
      })
      .from(forbiddenContentRule)
      .orderBy(asc(forbiddenContentRule.kind), asc(forbiddenContentRule.value));
  }),

  updateForbiddenContentRule: permissionProcedure({ moderation: ["update"] })
    .input(forbiddenContentRuleUpdateSchema)
    .handler(async ({ context: { db, session, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Updating forbidden content rule ${input.id} active=${input.isActive}`
      );

      await db
        .update(forbiddenContentRule)
        .set({
          isActive: input.isActive,
          updatedAt: new Date(),
          updatedBy: session.user.id,
        })
        .where(eq(forbiddenContentRule.id, input.id));

      return { success: true };
    }),
};
