import { QueryClient } from '@tanstack/react-query';

// Create a client
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchInterval: 0,
            refetchOnWindowFocus: false,
            refetchOnMount: true,
            staleTime: 60 * 1000 * 5,
            retry: 0,
            retryDelay: (attemptIndex) => {
                return Math.min(2000 * 2 * attemptIndex, 30000);
            }
        }
    }
});
