import { describe, expect, it, vi } from 'vitest';

import { isSessionRecordingAllowed } from './analytics';

import type { ApiUser, GetMeta } from '@nangohq/types';

vi.mock('posthog-js', () => ({ default: {} }));
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));

const user = { id: 1 } as ApiUser;
const meta = { hasBaa: false, debugMode: false } as GetMeta['Success']['data'];
const signedOut = { user: undefined, loadingUser: false, meta: undefined };
const signedIn = { user, loadingUser: false, userErrorCode: undefined };

describe('isSessionRecordingAllowed', () => {
    it.each([
        { name: 'waits while the user loads', input: { ...signedOut, loadingUser: true, userErrorCode: undefined }, expected: undefined },
        { name: 'records a signed-out visitor', input: { ...signedOut, userErrorCode: 'unauthorized' }, expected: true },
        { name: 'does not record when the user request fails otherwise', input: { ...signedOut, userErrorCode: 'server_error' }, expected: false },
        { name: 'does not record when the user request has no error code', input: { ...signedOut, userErrorCode: undefined }, expected: false },
        { name: 'stops while a signed-in user has no meta yet', input: { ...signedIn, meta: undefined }, expected: false },
        { name: 'records an account without a BAA', input: { ...signedIn, meta }, expected: true },
        { name: 'never records a BAA account', input: { ...signedIn, meta: { ...meta, hasBaa: true } }, expected: false },
        {
            name: 'does not record when meta has no hasBaa',
            input: { ...signedIn, meta: { ...meta, hasBaa: undefined } as unknown as GetMeta['Success']['data'] },
            expected: false
        },
        { name: 'never records an impersonated session', input: { ...signedIn, meta: { ...meta, debugMode: true } }, expected: false }
    ])('$name', ({ input, expected }) => {
        expect(isSessionRecordingAllowed(input)).toBe(expected);
    });
});
