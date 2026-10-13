import { inboundFiltersIntegration } from '@sentry/react';
import { describe, expect, it } from 'vitest';

import { sentryIgnoreErrors } from './sentry-ignore-errors.js';

import type { Event } from '@sentry/react';

const filter = inboundFiltersIntegration({ ignoreErrors: sentryIgnoreErrors });
const client = { getOptions: () => ({}) } as unknown as Parameters<NonNullable<typeof filter.processEvent>>[2];

function isDropped(type: string, value: string): boolean {
    const event: Event = { exception: { values: [{ type, value }] } };
    return filter.processEvent?.(event, {}, client) === null;
}

describe('sentryIgnoreErrors', () => {
    it.each([
        ['AbortError', 'signal is aborted without reason'],
        ['AbortError', 'The user aborted a request.'],
        ['TypeError', 'Failed to fetch'],
        ['TypeError', 'Failed to fetch (api-development.nango.dev)'],
        ['TypeError', 'Load failed'],
        ['TypeError', 'NetworkError when attempting to fetch resource.'],
        ['NotAllowedError', "Failed to execute 'writeText' on 'Clipboard': Document is not focused."],
        ['UnhandledRejection', 'Non-Error promise rejection captured with value: Object Not Found Matching Id:3, MethodName:update, ParamCount:4']
    ])('drops %s: %s', (type, value) => {
        expect(isDropped(type, value)).toBe(true);
    });

    it.each([
        ['TypeError', 'Failed to fetch dynamically imported module: https://app.nango.dev/assets/main-abc.js'],
        ['TypeError', 'Load failed for module script'],
        ['Error', 'Playground run failed: AbortError not handled'],
        ['Error', 'Failed to update integration settings']
    ])('keeps %s: %s', (type, value) => {
        expect(isDropped(type, value)).toBe(false);
    });
});
