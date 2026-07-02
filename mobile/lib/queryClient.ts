import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error: any) => {
        if ([401, 403].includes(error?.response?.status)) return false;
        return failureCount < 2;
      },
    },
  },
});
