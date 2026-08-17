import {
  gachaponActivationInputSchema,
  gachaponMachineDraftSchema,
} from "@repo/shared/collectibles";
import z from "zod";

import {
  collectiblesMutationMiddleware,
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
  slidingWindowRatelimitMiddleware,
} from "../index";
import { EterisError } from "../services/eteris";
import {
  activateGachapon,
  createGachaponMachine,
  GachaponError,
  getActiveGachaponMachine,
  getGachaponActivation,
  listActiveGachaponMachines,
  listGachaponMachinesForAdmin,
  listOwnGachaponActivations,
  retryGachaponActivationNotification,
  transitionGachaponMachine,
  updateGachaponMachine,
} from "../services/gachapon";

const publicRead = publicProcedure.use(
  slidingWindowRatelimitMiddleware(60, 60)
);
const privateRead = protectedProcedure.use(
  slidingWindowRatelimitMiddleware(30, 60)
);
const mutation = protectedProcedure
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(5, 60));
const adminRead = permissionProcedure({ gacha: ["view"] }).use(
  slidingWindowRatelimitMiddleware(30, 60)
);
const adminMutation = permissionProcedure({ gacha: ["manage"] })
  .use(collectiblesMutationMiddleware)
  .use(slidingWindowRatelimitMiddleware(20, 60));

const machineIdInput = z
  .object({ machineId: z.string().trim().min(1).max(200) })
  .strict();
const limitInput = z
  .object({ limit: z.number().int().min(1).max(100).default(50) })
  .optional();
const reasonSchema = z.string().trim().min(3).max(500);
const expectedVersionSchema = z.number().int().positive();
const transitionSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    idempotencyKey: z.string().trim().min(10).max(200),
    machineId: z.string().trim().min(1).max(200),
    reason: reasonSchema,
    state: z.enum(["active", "paused", "retired"]),
  })
  .strict();

function translateGachaponError(
  error: unknown,
  errors: Parameters<Parameters<typeof mutation.handler>[0]>[0]["errors"]
): never {
  if (error instanceof GachaponError) {
    if (
      error.code === "IDEMPOTENCY_CONFLICT" ||
      error.code === "STALE_COST" ||
      error.code === "STALE_VERSION"
    ) {
      throw errors.PROFILE_CUSTOMIZATION_CONFLICT({ message: error.message });
    }
    if (
      error.code === "ACTIVATION_NOT_FOUND" ||
      error.code === "MACHINE_UNAVAILABLE"
    ) {
      throw errors.NOT_FOUND({ message: error.message });
    }
    throw errors.BAD_REQUEST({ message: error.message });
  }
  if (error instanceof EterisError) {
    if (error.code === "IDEMPOTENCY_CONFLICT") {
      throw errors.PROFILE_CUSTOMIZATION_CONFLICT({
        message: "La clave de activación ya fue usada para otra operación.",
      });
    }
    throw errors.BAD_REQUEST({
      message:
        error.code === "INSUFFICIENT_FUNDS"
          ? "No tienes Eteris suficientes para activar esta máquina."
          : "Tu billetera no permite activar esta máquina.",
    });
  }
  throw error;
}

export default {
  activationById: privateRead
    .input(
      z.object({ activationId: z.string().trim().min(1).max(200) }).strict()
    )
    .handler(({ context: { db, session }, input }) =>
      getGachaponActivation(db, {
        activationId: input.activationId,
        userId: session.user.id,
      })
    ),
  activationByIdempotencyKey: privateRead
    .input(
      z.object({ idempotencyKey: z.string().trim().min(10).max(200) }).strict()
    )
    .handler(({ context: { db, session }, input }) =>
      getGachaponActivation(db, {
        idempotencyKey: input.idempotencyKey,
        userId: session.user.id,
      })
    ),
  activate: mutation
    .input(gachaponActivationInputSchema)
    .handler(async ({ context: { db, session }, errors, input }) => {
      try {
        return await activateGachapon(db, {
          ...input,
          actorUserId: session.user.id,
          impersonated: Boolean(session.session?.impersonatedBy),
          userId: session.user.id,
        });
      } catch (error) {
        translateGachaponError(error, errors);
      }
    }),
  detail: publicRead
    .input(machineIdInput)
    .handler(({ context: { db }, input }) =>
      getActiveGachaponMachine(db, input.machineId)
    ),
  history: privateRead
    .input(limitInput)
    .handler(({ context: { db, session }, input }) =>
      listOwnGachaponActivations(db, session.user.id, input?.limit)
    ),
  list: publicRead.handler(({ context: { db } }) =>
    listActiveGachaponMachines(db)
  ),
  retryNotification: permissionProcedure({ gacha: ["manage"] })
    .use(collectiblesMutationMiddleware)
    .use(slidingWindowRatelimitMiddleware(20, 60))
    .input(
      z.object({ activationId: z.string().trim().min(1).max(200) }).strict()
    )
    .handler(async ({ context: { db }, errors, input }) => {
      try {
        return await retryGachaponActivationNotification(
          db,
          input.activationId
        );
      } catch (error) {
        translateGachaponError(error, errors);
      }
    }),
  admin: {
    list: adminRead
      .input(limitInput)
      .handler(({ context: { db }, input }) =>
        listGachaponMachinesForAdmin(db, input?.limit)
      ),
    create: adminMutation
      .input(
        gachaponMachineDraftSchema.and(
          z.object({ reason: reasonSchema }).strict()
        )
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await createGachaponMachine(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateGachaponError(error, errors);
        }
      }),
    update: adminMutation
      .input(
        gachaponMachineDraftSchema.and(
          z
            .object({
              expectedVersion: expectedVersionSchema,
              machineId: z.string().trim().min(1).max(200),
              reason: reasonSchema,
            })
            .strict()
        )
      )
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await updateGachaponMachine(db, {
            ...input,
            actorUserId: session.user.id,
          });
        } catch (error) {
          translateGachaponError(error, errors);
        }
      }),
    transition: adminMutation
      .input(transitionSchema)
      .handler(async ({ context: { db, session }, errors, input }) => {
        try {
          return await transitionGachaponMachine(db, {
            ...input,
            actorUserId: session.user.id,
            impersonated: Boolean(session.session?.impersonatedBy),
          });
        } catch (error) {
          translateGachaponError(error, errors);
        }
      }),
  },
};
