import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { createBrowserRouter, createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom';

import { globalEnv } from './env';
import { redactSensitiveProperties, redactSensitiveText } from './sensitive-url';
import { sentryIgnoreErrors } from './sentry-ignore-errors';

/**
 * Auth routes carry tokens in the URL path (NAN-6506). `sendDefaultPii: false` does not cover
 * urls, and `httpContextIntegration` attaches `request.url` to errors and transactions alike.
 * Stack frame filenames are left alone: those are script urls, not the document url.
 */
function redactSensitiveEvent<TEvent extends Sentry.Event>(event: TEvent): TEvent {
    if (event.request?.url) {
        event.request.url = redactSensitiveText(event.request.url);
    }
    if (event.request?.headers?.['Referer']) {
        event.request.headers['Referer'] = redactSensitiveText(event.request.headers['Referer']);
    }
    if (event.transaction) {
        event.transaction = redactSensitiveText(event.transaction);
    }
    if (typeof event.message === 'string') {
        event.message = redactSensitiveText(event.message);
    }
    // A captured Error's text lands here rather than in `event.message`.
    for (const exception of event.exception?.values ?? []) {
        if (typeof exception.value === 'string') {
            exception.value = redactSensitiveText(exception.value);
        }
    }

    for (const breadcrumb of event.breadcrumbs ?? []) {
        // Navigation breadcrumbs keep the token in `from`/`to`, fetch ones in `url`.
        redactSensitiveProperties(breadcrumb.data);
    }

    redactSensitiveProperties(event.contexts?.trace?.data);

    for (const span of event.spans ?? []) {
        if (span.description) {
            span.description = redactSensitiveText(span.description);
        }
        redactSensitiveProperties(span.data);
    }

    return event;
}

// Must match the `sentry_environment` the CSP report-uri sends for the same deployment.
function getSentryEnvironment(): string {
    const { hostname } = window.location;
    if (hostname === 'app-staging.nango.dev') {
        return 'staging';
    }
    if (hostname === 'app-development.nango.dev' || hostname.endsWith('.app-development.nango.dev')) {
        return 'development';
    }
    return 'production';
}

// The dashboard renders customer-supplied data that can contain PHI (NAN-6428): no session
// replays, no console breadcrumbs, no serialized non-Error throw payloads.
Sentry.init({
    dsn: globalEnv.publicSentryKey,
    enabled: !import.meta.env.DEV,
    environment: getSentryEnvironment(),
    ignoreErrors: sentryIgnoreErrors,
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
        return redactSensitiveEvent(event);
    },
    beforeSendTransaction(event) {
        return redactSensitiveEvent(event);
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
