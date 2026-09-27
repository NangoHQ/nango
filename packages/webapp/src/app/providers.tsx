import { createTheme, MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

import { TooltipProvider } from '@nangohq/design-system';

import { ErrorBoundary } from '@/components/patterns/ErrorBoundary';
import { queryClient } from '@/store';
import { SentryErrorBoundary } from '@/utils/sentry';

import type { ReactNode } from 'react';

const theme = createTheme({
    fontFamily: 'Inter'
});

export const Providers = ({ children }: { children: ReactNode }) => {
    return (
        <SentryErrorBoundary fallback={<ErrorBoundary />}>
            <PostHogProvider client={posthog}>
                <NuqsAdapter>
                    <QueryClientProvider client={queryClient}>
                        <MantineProvider theme={theme}>
                            <TooltipProvider>{children}</TooltipProvider>
                        </MantineProvider>
                    </QueryClientProvider>
                </NuqsAdapter>
            </PostHogProvider>
        </SentryErrorBoundary>
    );
};
