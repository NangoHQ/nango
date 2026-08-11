import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import { createBrowserRouter, createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom';

import { globalEnv } from './env';
import { redactSensitiveText } from './sensitive-url';

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

    for (const breadcrumb of event.breadcrumbs ?? []) {
        // Navigation breadcrumbs keep the token in `from`/`to`, fetch ones in `url`.
        redactSensitiveValues(breadcrumb.data);
    }

    redactSensitiveValues(event.contexts?.trace?.data);

    for (const span of event.spans ?? []) {
        if (span.description) {
            span.description = redactSensitiveText(span.description);
        }
        redactSensitiveValues(span.data);
    }

    return event;
}

function redactSensitiveValues(data: Record<string, unknown> | undefined): void {
    if (!data) {
        return;
    }

    for (const [key, value] of Object.entries<unknown>(data)) {
        if (typeof value === 'string') {
            data[key] = redactSensitiveText(value);
        }
    }
}

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
