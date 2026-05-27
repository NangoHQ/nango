import { MantineProvider, createTheme } from '@mantine/core';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { SWRConfig } from 'swr';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { queryClient } from '@/store';
import { fetcher } from '@/utils/api';
import { SentryErrorBoundary } from '@/utils/sentry';
import { useSignout } from '@/utils/user';

import type { ReactNode } from 'react';

const theme = createTheme({
    fontFamily: 'Inter'
});

const SWRProvider = ({ children }: { children: ReactNode }) => {
    const signout = useSignout();

    return (
        <SWRConfig
            value={{
                refreshInterval: 15 * 60000,
                // Our server is not well configured if we enable that it will just fetch all the time
                revalidateIfStale: false,
                revalidateOnFocus: false,
                revalidateOnReconnect: true,
                fetcher,
                onError: (error) => {
                    if (error.status === 401) {
                        return signout();
                    }
                }
            }}
        >
            {children}
        </SWRConfig>
    );
};

export const Providers = ({ children }: { children: ReactNode }) => {
    return (
        <SentryErrorBoundary fallback={<ErrorBoundary />}>
            <PostHogProvider client={posthog}>
                <NuqsAdapter>
                    <QueryClientProvider client={queryClient}>
                        <MantineProvider theme={theme}>
                            <TooltipProvider>
                                <SWRProvider>{children}</SWRProvider>
                            </TooltipProvider>
                        </MantineProvider>
                    </QueryClientProvider>
                </NuqsAdapter>
            </PostHogProvider>
        </SentryErrorBoundary>
    );
};
