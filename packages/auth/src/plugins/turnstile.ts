import { env } from "@repo/env";
import { captcha } from "better-auth/plugins";

export const turnstilePlugin = () =>
  captcha({
    provider: "cloudflare-turnstile",
    secretKey: env.TURNSTILE_SECRET_KEY,
  });

export async function verifyTurnstileToken(
  token: string,
  options: { action: string; remoteIp?: string }
) {
  try {
    const body = new URLSearchParams({
      response: token,
      secret: env.TURNSTILE_SECRET_KEY,
    });
    if (options.remoteIp) {
      body.set("remoteip", options.remoteIp);
    }
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { body, method: "POST" }
    );
    if (!response.ok) {
      return "error" as const;
    }
    const result: unknown = await response.json();
    if (!(typeof result === "object" && result !== null)) {
      return "error" as const;
    }
    if (!("success" in result && typeof result.success === "boolean")) {
      return "error" as const;
    }
    if (!result.success) {
      return "fail" as const;
    }
    if (
      !("action" in result && typeof result.action === "string") ||
      !("hostname" in result && typeof result.hostname === "string")
    ) {
      return "error" as const;
    }
    return result.action === options.action &&
      result.hostname === new URL(env.BETTER_AUTH_URL).hostname
      ? ("pass" as const)
      : ("fail" as const);
  } catch {
    return "error" as const;
  }
}
