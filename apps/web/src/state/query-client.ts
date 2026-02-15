import { QueryClient } from "@tanstack/react-query";

export const QUERY_GC_TIME_MS = 5 * 60 * 1000;

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: QUERY_GC_TIME_MS,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

export const queryClient = createQueryClient();
