import { describe, expect, it } from "vitest";

import {
  findPatreonMembershipForCampaign,
  parsePatreonIdentityResponse,
} from "./index";
import type { PatreonIdentityResponse } from "./index";

const identityResponse = {
  data: {
    id: "patreon-user-id",
    attributes: {},
    relationships: {
      memberships: {
        data: [
          {
            id: "other-campaign-membership-id",
            type: "member",
          },
          {
            id: "target-campaign-membership-id",
            type: "member",
          },
        ],
      },
    },
    type: "user",
  },
  included: [
    {
      attributes: {},
      id: "other-campaign-membership-id",
      relationships: {
        campaign: {
          data: {
            id: "other-campaign-id",
            type: "campaign",
          },
          links: {
            related:
              "https://www.patreon.com/api/oauth2/v2/campaigns/other-campaign-id",
          },
        },
        currently_entitled_tiers: {
          data: [
            {
              id: "other-tier-id",
              type: "tier",
            },
          ],
        },
      },
      type: "member",
    },
    {
      attributes: {},
      id: "target-campaign-membership-id",
      relationships: {
        campaign: {
          data: {
            id: "target-campaign-id",
            type: "campaign",
          },
          links: {
            related:
              "https://www.patreon.com/api/oauth2/v2/campaigns/target-campaign-id",
          },
        },
        currently_entitled_tiers: {
          data: [
            {
              id: "target-tier-id",
              type: "tier",
            },
          ],
        },
      },
      type: "member",
    },
    {
      attributes: {},
      id: "other-campaign-id",
      type: "campaign",
    },
    {
      attributes: {},
      id: "target-campaign-id",
      type: "campaign",
    },
    {
      attributes: {},
      id: "other-tier-id",
      type: "tier",
    },
    {
      attributes: {},
      id: "target-tier-id",
      type: "tier",
    },
  ],
  links: {
    self: "https://www.patreon.com/api/oauth2/v2/user/patreon-user-id",
  },
} satisfies PatreonIdentityResponse;

const identityResponseWithMemberFields = {
  ...identityResponse,
  included: identityResponse.included.map((item) => {
    if (item.type !== "member") {
      return item;
    }

    return {
      ...item,
      attributes: {
        currently_entitled_amount_cents:
          item.id === "target-campaign-membership-id" ? 899 : 0,
        patron_status:
          item.id === "target-campaign-membership-id" ? "active_patron" : null,
        pledge_relationship_start:
          item.id === "target-campaign-membership-id"
            ? "2026-04-19T22:10:46.643+00:00"
            : "2026-03-20T01:03:43.744+00:00",
      },
    };
  }),
} satisfies PatreonIdentityResponse;

describe("findPatreonMembershipForCampaign", () => {
  it("parses the membership response shape requested from Patreon", () => {
    const result = parsePatreonIdentityResponse(
      identityResponseWithMemberFields
    );

    expect(result.success).toBe(true);
  });

  it("ignores unrelated included resource types from Patreon", () => {
    const result = parsePatreonIdentityResponse({
      ...identityResponseWithMemberFields,
      included: [
        ...identityResponseWithMemberFields.included,
        {
          id: "unexpected-resource-id",
          type: "unexpected_resource",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.included?.some((item) => item === null)).toBe(false);
  });

  it("selects the membership for the requested campaign", () => {
    const membership = findPatreonMembershipForCampaign(
      identityResponse,
      "target-campaign-id"
    );

    expect(membership?.id).toBe("target-campaign-membership-id");
    expect(
      membership?.relationships.currently_entitled_tiers?.data.map(
        (tier) => tier.id
      )
    ).toEqual(["target-tier-id"]);
  });

  it("returns null when the user has no membership for the campaign", () => {
    expect(findPatreonMembershipForCampaign(identityResponse, "missing")).toBe(
      null
    );
  });
});
