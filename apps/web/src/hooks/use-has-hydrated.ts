import { useSyncExternalStore } from "react";

const unsubscribeFromHydration = () => true;
const subscribeToHydration = () => unsubscribeFromHydration;
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHasHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerSnapshot
  );
}
