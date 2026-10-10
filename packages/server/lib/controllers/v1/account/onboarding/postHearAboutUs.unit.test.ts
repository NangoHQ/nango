import { beforeEach, describe, expect, it, vi } from 'vitest';

import { postOnboardingHearAboutUs } from './postHearAboutUs.js';

const mocks = vi.hoisted(() => ({ allowed: vi.fn(), update: vi.fn(), group: vi.fn() }));
vi.mock('@nangohq/shared', () => ({
    accountService: { shouldShowHearAboutUs: mocks.allowed, updateAccount: mocks.update },
    productTracking: { identifyAccountGroup: mocks.group }
}));
vi.mock('@nangohq/utils', () => ({ requireEmptyQuery: () => undefined, zodErrorToHTTP: () => [] }));
vi.mock('../../../../utils/asyncWrapper.js', () => ({ asyncWrapper: (handler: unknown) => handler }));

describe('signup answer analytics', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.allowed.mockResolvedValue(true);
    });

    function response(foundUs = '') {
        return { locals: { account: { id: 42, found_us: foundUs } }, status: vi.fn().mockReturnThis(), send: vi.fn() };
    }

    it('sets only the separate answer property after saving', async () => {
        const res = response();
        await postOnboardingHearAboutUs({ body: { source: 'social_media' } } as never, res as never, vi.fn());

        expect(mocks.update).toHaveBeenCalledWith({ id: 42, foundUs: 'social_media' });
        expect(mocks.group).toHaveBeenCalledExactlyOnceWith(42, { discovery_source: 'social_media' });
        expect(mocks.update).toHaveBeenCalledBefore(mocks.group);
    });

    it('does not overwrite an existing answer', async () => {
        const res = response('search_engine');
        await postOnboardingHearAboutUs({ body: { source: 'social_media' } } as never, res as never, vi.fn());

        expect(res.status).toHaveBeenCalledWith(403);
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.group).not.toHaveBeenCalled();
    });

    it('does not publish an answer when saving fails', async () => {
        mocks.update.mockRejectedValueOnce(new Error('save failed'));
        await expect(postOnboardingHearAboutUs({ body: { source: 'social_media' } } as never, response() as never, vi.fn())).rejects.toThrow('save failed');
        expect(mocks.group).not.toHaveBeenCalled();
    });
});
