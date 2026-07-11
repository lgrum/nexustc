"use client";

import { useSyncExternalStore } from "react";

let pendingMethods: string[] | undefined;
let pendingScope: string | undefined;
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
  pendingMethods = undefined;
  pendingScope = scope;
  notify();
};

export const getPendingTwoFactorMethods = (scope: string) =>
  pendingScope === scope ? pendingMethods : undefined;

export const isTwoFactorRedirectActive = (scope: string) =>
  pendingScope === scope;

export const setPendingTwoFactorMethods = (methods?: string[]) => {
  if (!pendingScope) {
    return;
  }
  pendingMethods = methods;
  notify();
};

export const clearPendingTwoFactorMethods = (scope: string) => {
  if (pendingScope !== scope) {
    return;
  }
  pendingMethods = undefined;
  pendingScope = undefined;
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
