import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";

import { env } from "@repo/env";

const DEVICE_COOKIE = "ntc_device";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readCookie(headers: Headers, name: string) {
  for (const entry of (headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) {
      return value.join("=");
    }
  }
  return null;
}

export function ensureIntegrityDeviceCookie(headers: Headers) {
  const existing = readCookie(headers, DEVICE_COOKIE);
  if (existing && UUID_PATTERN.test(existing)) {
    return { deviceId: existing, setCookie: null };
  }
  const deviceId = randomUUID();
  return {
    deviceId,
    setCookie: `${DEVICE_COOKIE}=${deviceId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
  };
}

function expandIpv6(ip: string) {
  const [left = "", right = ""] = ip.toLowerCase().split("::");
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const missing = Math.max(0, 8 - leftGroups.length - rightGroups.length);
  return [
    ...leftGroups,
    ...Array.from({ length: missing }, () => "0"),
    ...rightGroups,
  ];
}

export function getCoarseIpPrefix(ip: string) {
  if (isIP(ip) === 4) {
    return `${ip.split(".").slice(0, 3).join(".")}.0/24`;
  }
  if (isIP(ip) === 6) {
    const groups = expandIpv6(ip)
      .slice(0, 4)
      .map((part) => Number.parseInt(part, 16).toString(16));
    return `${groups.join(":")}::/64`;
  }
  return null;
}

function keyedHash(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function buildIntegrityCorrelationEvidence(
  headers: Headers,
  secret = env.BETTER_AUTH_SECRET
) {
  const deviceId = readCookie(headers, DEVICE_COOKIE);
  const ipPrefix = getCoarseIpPrefix(
    headers.get("cf-connecting-ip")?.trim() ?? ""
  );
  return {
    deviceHash:
      deviceId && UUID_PATTERN.test(deviceId)
        ? keyedHash(secret, `device:${deviceId}`)
        : null,
    ipPrefixHash: ipPrefix ? keyedHash(secret, `ip:${ipPrefix}`) : null,
  };
}
