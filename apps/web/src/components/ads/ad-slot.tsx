"use client";

import { getAdPolicy } from "@repo/shared/constants";
import type { AdPolicy, PatronTier } from "@repo/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";

const EXOCLICK_SCRIPT_ID = "exoclick-ad-provider";
const EXOCLICK_SCRIPT_SRC = "https://a.magsrv.com/ad-provider.js";
const MOBILE_MEDIA_QUERY = "(max-width: 767px)";
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

declare global {
  interface Window {
    AdProvider?: { serve: Record<string, never> }[];
    __nexustcExoClickServedSlots?: Set<string>;
  }
}

export function useViewerAdPolicy(): {
  isLoading: boolean;
  policy: AdPolicy;
} {
  const { data: auth, isPending: authPending } = authClient.useSession();
  const patronStatus = useQuery({
    ...orpc.patreon.getStatus.queryOptions(),
    enabled: Boolean(auth?.session),
  });

  if (authPending || (auth?.session && patronStatus.isPending)) {
    return { isLoading: true, policy: "none" };
  }

  const tier = (auth?.session ? patronStatus.data?.tier : "none") ?? "none";

  return {
    isLoading: false,
    policy: getAdPolicy({
      role: auth?.user.role,
      tier: tier as PatronTier,
    }),
  };
}

export function AdSlot({
  className,
  cooldownKey,
  cooldownMs,
  media,
  providerSrc = EXOCLICK_SCRIPT_SRC,
  reduced = false,
  zoneId,
}: {
  className: string;
  cooldownKey?: string;
  cooldownMs?: number;
  media?: "desktop" | "mobile";
  providerSrc?: string;
  reduced?: boolean;
  zoneId: string;
}) {
  const { isLoading, policy } = useViewerAdPolicy();
  const mediaMatches = useMediaMatches(media);
  const canServe = useAdCooldown(cooldownKey, cooldownMs);

  if (
    isLoading ||
    !mediaMatches ||
    !canServe ||
    policy === "none" ||
    (reduced && policy !== "all")
  ) {
    return null;
  }

  return (
    <ExoClickAd
      className={className}
      providerSrc={providerSrc}
      zoneId={zoneId}
    />
  );
}

export function PopunderAdScript({
  media,
  scriptId,
  src,
}: {
  media: "desktop" | "mobile";
  scriptId: string;
  src: string;
}) {
  const { isLoading, policy } = useViewerAdPolicy();
  const mediaMatches = useMediaMatches(media);

  useEffect(() => {
    if (isLoading || !mediaMatches || policy === "none") {
      return;
    }

    if (document.querySelector(`#${scriptId}`)) {
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.id = scriptId;
    script.src = src;
    script.type = "application/javascript";
    document.body.append(script);
  }, [isLoading, mediaMatches, policy, scriptId, src]);

  return null;
}

function useMediaMatches(media: "desktop" | "mobile" | undefined) {
  const [matches, setMatches] = useState(media === undefined);

  useEffect(() => {
    if (!media) {
      return;
    }

    const query = media === "mobile" ? MOBILE_MEDIA_QUERY : DESKTOP_MEDIA_QUERY;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);

    return () => list.removeEventListener("change", update);
  }, [media]);

  return matches;
}

function useAdCooldown(
  key: string | undefined,
  cooldownMs: number | undefined
) {
  const [canServe, setCanServe] = useState(!key || !cooldownMs);

  useEffect(() => {
    if (!key || !cooldownMs) {
      return;
    }

    const storageKey = `nexustc-ad:${key}`;
    try {
      const lastServedAt = Number(window.localStorage.getItem(storageKey) ?? 0);
      const nextCanServe = Date.now() - lastServedAt >= cooldownMs;
      setCanServe(nextCanServe);

      if (nextCanServe) {
        window.localStorage.setItem(storageKey, String(Date.now()));
      }
    } catch {
      setCanServe(true);
    }
  }, [cooldownMs, key]);

  return canServe;
}

function ExoClickAd({
  className,
  providerSrc,
  zoneId,
}: {
  className: string;
  providerSrc: string;
  zoneId: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    const scriptId = `${EXOCLICK_SCRIPT_ID}-${btoa(providerSrc).replaceAll(
      "=",
      ""
    )}`;

    if (!document.querySelector(`#${scriptId}`)) {
      const script = document.createElement("script");
      script.async = true;
      script.id = scriptId;
      script.src = providerSrc;
      script.type = "application/javascript";
      document.head.append(script);
    }

    window.__nexustcExoClickServedSlots =
      window.__nexustcExoClickServedSlots ?? new Set<string>();

    const servedKey = `${pathname}:${providerSrc}:${zoneId}`;
    if (window.__nexustcExoClickServedSlots.has(servedKey)) {
      return;
    }

    window.__nexustcExoClickServedSlots.add(servedKey);
    window.AdProvider = window.AdProvider || [];
    window.AdProvider.push({ serve: {} });
  }, [pathname, providerSrc, zoneId]);

  return <ins className={className} data-zoneid={zoneId} />;
}
