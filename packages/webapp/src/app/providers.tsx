import { createTheme, MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { SWRConfig } from 'swr';

import { TooltipProvider } from '@nangohq/design-system';

import { ErrorBoundary } from '@/components/patterns/ErrorBoundary';
import { queryClient } from '@/store';
import { fetcher } from '@/utils/api';
import { isPublicAuthPath } from '@/utils/routes';
import { SentryErrorBoundary } from '@/utils/sentry';
import { signout } from '@/utils/user';

import type { ReactNode } from 'react';

const theme = createTheme({
    fontFamily: 'Inter'
});

const SWRProvider = ({ children }: { children: ReactNode }) => {
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
                    if (error.status !== 401) {
                        return;
                    }

                    // Same capture-before-await as the query client's handler: PrivateRoute redirects on this 401 too.
                    const { pathname, search, hash } = window.location;
                    if (isPublicAuthPath(pathname)) {
                        return;
                    }

                    return signout({ expired: true, from: { pathname, search, hash } });
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
