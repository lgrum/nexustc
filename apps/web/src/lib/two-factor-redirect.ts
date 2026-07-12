"use client";

import { useSyncExternalStore } from "react";

const pendingMethodsByScope = new Map<string, string[] | undefined>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const beginTwoFactorRedirect = (scope: string) => {
  pendingMethodsByScope.set(scope, undefined);
  notify();
};

export const getPendingTwoFactorMethods = (scope: string) =>
  pendingMethodsByScope.get(scope);

export const isTwoFactorRedirectActive = (scope: string) =>
  pendingMethodsByScope.has(scope);

export const setPendingTwoFactorMethods = (
  scope: string,
  methods?: string[]
) => {
  if (!pendingMethodsByScope.has(scope)) {
    return;
  }
  pendingMethodsByScope.set(scope, methods);
  notify();
};

export const clearPendingTwoFactorMethods = (scope: string) => {
  if (!pendingMethodsByScope.delete(scope)) {
    return;
  }
  notify();
};

export const usePendingTwoFactorMethods = (scope: string) => {
  const getSnapshot = () => getPendingTwoFactorMethods(scope);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useIsTwoFactorRedirectActive = (scope: string) => {
  const getSnapshot = () => isTwoFactorRedirectActive(scope);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
