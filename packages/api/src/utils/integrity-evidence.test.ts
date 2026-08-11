import { describe, expect, it } from "vitest";

import {
  buildIntegrityCorrelationEvidence,
  ensureIntegrityDeviceCookie,
  getCoarseIpPrefix,
} from "./integrity-evidence";

describe("integrity correlation evidence", () => {
  it("coarsens valid Cloudflare addresses without retaining a raw IP", () => {
    expect(getCoarseIpPrefix("203.0.113.42")).toBe("203.0.113.0/24");
    expect(getCoarseIpPrefix("2001:db8:abcd:12::9")).toBe(
      "2001:db8:abcd:12::/64"
    );
    expect(getCoarseIpPrefix("not-an-ip")).toBeNull();
  });

  it("issues a secure first-party cookie and reuses an existing identifier", () => {
    const first = ensureIntegrityDeviceCookie(new Headers(), "secret-a");
    expect(first.setCookie).toMatch(
      /^ntc_device=[0-9a-f-]+\.[a-f0-9]{64}; Path=\/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/
    );
    const second = ensureIntegrityDeviceCookie(
      new Headers({ cookie: `ntc_device=${first.cookieValue}` }),
      "secret-a"
    );
    expect(second).toEqual({
      cookieValue: first.cookieValue,
      deviceId: first.deviceId,
      setCookie: null,
    });
  });

  it("replaces unsigned or incorrectly signed device identifiers", () => {
    const forged = new Headers({
      cookie: "ntc_device=550e8400-e29b-41d4-a716-446655440000",
    });
    expect(
      buildIntegrityCorrelationEvidence(forged, "secret-a").deviceHash
    ).toBeNull();
    expect(
      ensureIntegrityDeviceCookie(forged, "secret-a").setCookie
    ).not.toBeNull();
  });

  it("returns only keyed hashes for anomalous persistence", () => {
    const signed = ensureIntegrityDeviceCookie(new Headers(), "secret-a");
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.42",
      cookie: `ntc_device=${signed.cookieValue}`,
    });
    const evidence = buildIntegrityCorrelationEvidence(headers, "secret-a");

    expect(evidence.deviceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.ipPrefixHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(evidence)).not.toContain("203.0.113");
    expect(JSON.stringify(evidence)).not.toContain("550e8400");
    expect(buildIntegrityCorrelationEvidence(headers, "secret-b")).not.toEqual(
      evidence
    );
  });
});
