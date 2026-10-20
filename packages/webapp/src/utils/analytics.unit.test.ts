import { describe, expect, it, vi } from 'vitest';

import { isSessionRecordingAllowed } from './analytics';

import type { ApiUser, GetMeta } from '@nangohq/types';

vi.mock('posthog-js', () => ({ default: {} }));
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));

const user = { id: 1 } as ApiUser;
const meta = { hasBaa: false, debugMode: false } as GetMeta['Success']['data'];

describe('isSessionRecordingAllowed', () => {
    it.each([
        { name: 'waits while the user loads', input: { user: undefined, loadingUser: true, meta: undefined }, expected: undefined },
        { name: 'records a signed-out visitor', input: { user: undefined, loadingUser: false, meta: undefined }, expected: true },
        { name: 'stops while a signed-in user has no meta yet', input: { user, loadingUser: false, meta: undefined }, expected: false },
        { name: 'records an account without a BAA', input: { user, loadingUser: false, meta }, expected: true },
        { name: 'never records a BAA account', input: { user, loadingUser: false, meta: { ...meta, hasBaa: true } }, expected: false },
        { name: 'never records an impersonated session', input: { user, loadingUser: false, meta: { ...meta, debugMode: true } }, expected: false }
    ])('$name', ({ input, expected }) => {
        expect(isSessionRecordingAllowed(input)).toBe(expected);
    });
});
