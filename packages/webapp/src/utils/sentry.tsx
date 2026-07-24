import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { createBrowserRouter, createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom';

import { globalEnv } from './env';

// The dashboard renders customer-supplied data that can contain PHI (NAN-6428): no session
// replays, no console breadcrumbs, no serialized non-Error throw payloads.
Sentry.init({
    dsn: globalEnv.publicSentryKey,
    integrations: [
        Sentry.reactRouterV6BrowserTracingIntegration({
            useEffect,
            useLocation,
            useNavigationType,
            createRoutesFromChildren,
            matchRoutes
        })
    ],
    tracePropagationTargets: [/^https:\/\/api.nango\.dev/],
    tracesSampleRate: 0.1,
    maxBreadcrumbs: 50,
    sendDefaultPii: false,
    beforeSend(event) {
        if (event.extra) {
            delete event.extra['__serialized__'];
        }
        return event;
    },
    beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.category === 'console') {
            return null;
        }
        return breadcrumb;
    }
});

export const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouterV6(createBrowserRouter);

export const SentryErrorBoundary = Sentry.ErrorBoundary;
