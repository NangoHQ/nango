import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { Routes, createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom';

Sentry.init({
    dsn: process.env.REACT_APP_PUBLIC_SENTRY_KEY,
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
    tracePropagationTargets: [/^https:\/\/app.nango\.dev\/api/],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 0.3,
    maxBreadcrumbs: 50
});

export const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes);

export const SentryErrorBoundary = Sentry.ErrorBoundary;
