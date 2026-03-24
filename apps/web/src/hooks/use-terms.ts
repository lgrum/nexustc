import { useQuery } from "@tanstack/react-query";

import { orpcClient } from "@/lib/orpc";

export function useTerms() {
  const query = useQuery({
    gcTime: 1000 * 60,
    queryFn: () => orpcClient.term.getAll(),
    queryKey: ["terms"],
    staleTime: 1000 * 60,
    throwOnError: true,
  });

  return query;
}
