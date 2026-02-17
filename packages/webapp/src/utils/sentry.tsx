import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { createBrowserRouter, createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom';

import { globalEnv } from './env';

Sentry.init({
    dsn: globalEnv.publicSentryKey,
    integrations: [
        Sentry.reactRouterV6BrowserTracingIntegration({
            useEffect,
            useLocation,
            useNavigationType,
            createRoutesFromChildren,
            matchRoutes
        }),
        Sentry.replayIntegration()
    ],
    tracePropagationTargets: [/^https:\/\/api.nango\.dev/],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 0.3,
    maxBreadcrumbs: 50
});

export const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouterV6(createBrowserRouter);

export const SentryErrorBoundary = Sentry.ErrorBoundary;
