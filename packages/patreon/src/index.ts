import type { ZodError } from "zod";
import z from "zod";

const PATREON_API_BASE = "https://www.patreon.com/api/oauth2/v2";

const patreonTierSchema = z.looseObject({
  id: z.string(),
  type: z.literal("tier"),
});

const patreonCampaignSchema = z.looseObject({
  id: z.string(),
  type: z.literal("campaign"),
});

const patreonMemberSchema = z.looseObject({
  id: z.string(),
  attributes: z.object({
    currently_entitled_amount_cents: z.number().nullable().optional(),
    patron_status: z.string().nullable().optional(),
    pledge_relationship_start: z.string().nullable().optional(),
  }),
  relationships: z.object({
    campaign: z.looseObject({
      data: z.object({ id: z.string(), type: z.literal("campaign") }),
    }),
    currently_entitled_tiers: z
      .object({
        data: z.array(patreonTierSchema),
      })
      .optional(),
  }),
  type: z.literal("member"),
});

const patreonIdentityResponseSchema = z.looseObject({
  data: z.looseObject({
    id: z.string(),
    relationships: z
      .object({
        memberships: z
          .object({
            data: z.array(
              z.object({ id: z.string(), type: z.literal("member") })
            ),
          })
          .optional(),
      })
      .optional(),
    type: z.literal("user"),
  }),
  included: z
    .array(
      z.discriminatedUnion("type", [
        patreonMemberSchema,
        patreonTierSchema,
        patreonCampaignSchema,
      ])
    )
    .optional(),
});

export type PatreonIdentityResponse = z.infer<
  typeof patreonIdentityResponseSchema
>;

export type PatreonMember = z.infer<typeof patreonMemberSchema>;

export function parsePatreonIdentityResponse(rawData: unknown) {
  return patreonIdentityResponseSchema.safeParse(rawData);
}

export function findPatreonMembershipForCampaign(
  data: PatreonIdentityResponse,
  campaignId: string
): PatreonMember | null {
  const memberIds = new Set(
    data.data.relationships?.memberships?.data.map(
      (membership) => membership.id
    )
  );

  const memberships =
    data.included?.filter(
      (item): item is PatreonMember =>
        item.type === "member" &&
        memberIds.has(item.id) &&
        item.relationships.campaign.data.id === campaignId
    ) ?? [];

  if (memberships.length === 0) {
    return null;
  }

  const activeMembership = memberships.find(
    (membership) => membership.attributes.patron_status === "active_patron"
  );

  return activeMembership ?? memberships[0] ?? null;
}

const patreonUserInfoSchema = z.looseObject({
  data: z.looseObject({
    attributes: z.looseObject({
      email: z.string(),
      full_name: z.string(),
      image_url: z.string(),
    }),
    id: z.string(),
  }),
});

export class PatreonIdentity {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async fetchIdentity(): Promise<
    | [null, z.infer<typeof patreonIdentityResponseSchema>, true]
    | [
        ZodError<z.infer<typeof patreonIdentityResponseSchema>> | string,
        null,
        false,
      ]
  > {
    const url = new URL(`${PATREON_API_BASE}/identity`);
    url.searchParams.set(
      "include",
      "memberships,memberships.campaign,memberships.currently_entitled_tiers"
    );
    url.searchParams.set(
      "fields[member]",
      "patron_status,pledge_relationship_start,currently_entitled_amount_cents"
    );

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      const error = await response.text();
      return [error, null, false] as const;
    }

    const rawData = await response.json();
    const parseResult = parsePatreonIdentityResponse(rawData);

    if (!parseResult.success) {
      return [parseResult.error, null, false] as const;
    }

    const { data } = parseResult;

    return [null, data, true] as const;
  }

  async fetchUserInfo(): Promise<
    | [null, z.infer<typeof patreonUserInfoSchema>, true]
    | [
        (
          | ReturnType<(typeof patreonUserInfoSchema)["safeParse"]>["error"]
          | string
        ),
        null,
        false,
      ]
  > {
    const url = new URL(`${PATREON_API_BASE}/identity`);
    url.searchParams.set("fields[user]", "created,email,full_name,image_url");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return [error, null, false] as const;
    }

    const rawData = await response.json();
    const parseResult = patreonUserInfoSchema.safeParse(rawData);

    if (!parseResult.success) {
      return [parseResult.error, null, false] as const;
    }

    const { data } = parseResult;

    return [null, data, true] as const;
  }
}
