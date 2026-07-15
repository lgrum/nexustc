import { useEffect, useState } from "react";

import { AD_PROVIDER_SCRIPT_SOURCES } from "@/components/ads/ad-config";

type AdblockDetectorState = {
  detected: boolean;
  checked: boolean;
};

type DetectionResult = "blocked" | "clear" | "inconclusive";
type Detector = "asset" | "css" | "dom" | "provider" | "script";
type DetectionRound = {
  blockedSignals: Detector[];
  result: DetectionResult;
};
type ResourceProbe = "ok" | "rejected" | "timeout" | "unavailable";

declare global {
  type WindowWithAd = Window & { adLoaded?: boolean };
}

const DETECTION_THRESHOLD = 1;
const DETECTION_TIMEOUT_MS = 3000;
const RETRY_DELAY_MS = 1000;

function checkDomBait(): Promise<boolean> {
  return new Promise((resolve) => {
    const bait = document.createElement("div");
    bait.className =
      "ads ad adsbox ad-unit ad-container ad-wrapper sponsored advertisement";
    bait.dataset.adSlot = "1234567890";
    bait.dataset.adFormat = "auto";
    bait.id = "ad-banner-top";
    bait.innerHTML = "&nbsp;";
    bait.style.cssText =
      "position:absolute;top:-1000px;left:-1000px;height:1px;width:1px;";
    document.body.append(bait);

    requestAnimationFrame(() => {
      const style = window.getComputedStyle(bait);
      const isBlocked =
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        bait.offsetHeight === 0 ||
        bait.offsetWidth === 0 ||
        bait.offsetParent === null;

      bait.remove();
      resolve(isBlocked);
    });
  });
}

function checkBaitScript(): Promise<DetectionResult> {
  return new Promise((resolve) => {
    let settled = false;
    let markerCheck: ReturnType<typeof setTimeout> | undefined;
    const win = window as WindowWithAd;
    win.adLoaded = false;
    document.querySelector("#ml23f9jo38asl34")?.remove();
    const script = document.createElement("script");
    script.src = "/oncc-adbanner.js";
    const finish = (result: DetectionResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      clearTimeout(markerCheck);
      script.remove();
      resolve(result);
    };
    const timeout = setTimeout(
      () => finish("inconclusive"),
      DETECTION_TIMEOUT_MS
    );

    script.addEventListener("error", () => finish("blocked"), { once: true });
    script.addEventListener(
      "load",
      () => {
        markerCheck = setTimeout(() => {
          const markerExists = document.querySelector("#ml23f9jo38asl34");
          finish(
            win.adLoaded === true && markerExists !== null ? "clear" : "blocked"
          );
        }, 100);
      },
      { once: true }
    );
    document.body.append(script);
  });
}

async function probeResource(
  url: string,
  mode?: RequestMode
): Promise<ResourceProbe> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DETECTION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      mode,
      signal: controller.signal,
    });
    return response.ok || response.type === "opaque" ? "ok" : "unavailable";
  } catch {
    return controller.signal.aborted ? "timeout" : "rejected";
  } finally {
    clearTimeout(timeout);
  }
}

function checkCssInjection(): Promise<boolean> {
  return new Promise((resolve) => {
    const style = document.createElement("style");
    style.textContent = ".adsbox-test { height: 10px !important; }";
    document.head.append(style);

    const testDiv = document.createElement("div");
    testDiv.className = "adsbox adsbox-test";
    testDiv.style.height = "10px";
    testDiv.style.position = "absolute";
    testDiv.style.top = "-1000px";
    document.body.append(testDiv);

    requestAnimationFrame(() => {
      const height = testDiv.offsetHeight;
      testDiv.remove();
      style.remove();
      resolve(height === 0);
    });
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function classifyResourceProbe(
  control: ResourceProbe,
  resource: ResourceProbe
): DetectionResult {
  if (control !== "ok") {
    return "inconclusive";
  }
  if (resource === "ok") {
    return "clear";
  }
  return resource === "rejected" ? "blocked" : "inconclusive";
}

async function runDetectionRound(): Promise<DetectionRound> {
  const [
    dom,
    scriptExecution,
    control,
    scriptProbe,
    assetProbe,
    providerProbes,
    css,
  ] = await Promise.all([
    withTimeout(checkDomBait(), DETECTION_TIMEOUT_MS, null),
    checkBaitScript(),
    probeResource("/api/health"),
    probeResource("/oncc-adbanner.js"),
    probeResource("/ads/banner.gif"),
    Promise.all(
      AD_PROVIDER_SCRIPT_SOURCES.map((source) =>
        probeResource(source, "no-cors")
      )
    ),
    withTimeout(checkCssInjection(), DETECTION_TIMEOUT_MS, null),
  ]);
  const scriptRequest = classifyResourceProbe(control, scriptProbe);
  const assetRequest = classifyResourceProbe(control, assetProbe);
  const providerRequests = providerProbes.map((probe) =>
    classifyResourceProbe(control, probe)
  );
  let script: DetectionResult = "inconclusive";
  if (scriptExecution === "clear") {
    script = "clear";
  } else if (
    scriptRequest === "blocked" ||
    (scriptExecution === "blocked" && scriptRequest === "clear")
  ) {
    script = "blocked";
  }
  const blockedSignals = [
    ...(dom === true ? (["dom"] as const) : []),
    ...(script === "blocked" ? (["script"] as const) : []),
    ...(assetRequest === "blocked" ? (["asset"] as const) : []),
    ...(providerRequests.some((result) => result === "blocked")
      ? (["provider"] as const)
      : []),
    ...(css === true ? (["css"] as const) : []),
  ];

  if (blockedSignals.length >= DETECTION_THRESHOLD) {
    return { blockedSignals, result: "blocked" };
  }

  return {
    blockedSignals,
    result:
      script === "clear" || assetRequest === "clear" ? "clear" : "inconclusive",
  };
}

export function hasRepeatedBlockedSignal(
  first: DetectionRound,
  second: DetectionRound
): boolean {
  return (
    first.result === "blocked" &&
    second.result === "blocked" &&
    first.blockedSignals.some((signal) =>
      second.blockedSignals.includes(signal)
    )
  );
}

export function useAdblockDetector(enabled = true) {
  const [state, setState] = useState<AdblockDetectorState>({
    checked: false,
    detected: false,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ checked: true, detected: false });
      return;
    }

    let mounted = true;

    const runDetection = async () => {
      const first = await runDetectionRound();
      let second = first;
      if (first.result !== "clear") {
        await wait(RETRY_DELAY_MS);
        second = await runDetectionRound();
      }

      if (!mounted) {
        return;
      }

      setState({
        checked: true,
        detected: hasRepeatedBlockedSignal(first, second),
      });
    };

    runDetection();

    return () => {
      mounted = false;
    };
  }, [enabled]);

  return state;
}
