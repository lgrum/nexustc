import { orpc } from "./orpc";

export function getAppThemeQueryOptions(userId: string) {
  const options = orpc.appTheme.getMine.queryOptions();

  return {
    ...options,
    queryKey: [...options.queryKey, { userId }] as const,
  };
}
