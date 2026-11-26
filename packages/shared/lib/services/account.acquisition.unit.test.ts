import { afterEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';

import { productTracking } from '../utils/productTracking.js';
import accountService from './account.service.js';

describe('account acquisition after commit', () => {
    afterEach(() => vi.restoreAllMocks());

    it('adds source to the existing event and account exactly once', async () => {
        const account = { id: 42, name: 'Test account' };
        vi.spyOn(db.knex, 'transaction').mockResolvedValueOnce(account);
        const track = vi.spyOn(productTracking, 'track').mockImplementation(() => undefined);
        const group = vi.spyOn(productTracking, 'identifyAccountGroup').mockImplementation(() => undefined);
        const acquisition = { acquisition_utm_source: 'facebook', acquisition_landing_path: '/' };

        await accountService.createAccount({ name: 'Test', acquisition });

        expect(track).toHaveBeenCalledExactlyOnceWith({ name: 'auth:account_create', team: account, eventProperties: acquisition });
        expect(group).toHaveBeenCalledExactlyOnceWith(42, acquisition);
    });

    it('sends no event or source when the account transaction fails', async () => {
        vi.spyOn(db.knex, 'transaction').mockRejectedValueOnce(new Error('rolled back'));
        const track = vi.spyOn(productTracking, 'track');
        const group = vi.spyOn(productTracking, 'identifyAccountGroup');

        await expect(accountService.createAccount({ name: 'Test', acquisition: { acquisition_utm_source: 'facebook' } })).rejects.toThrow('rolled back');

        expect(track).not.toHaveBeenCalled();
        expect(group).not.toHaveBeenCalled();
    });

    it('does not attribute non-signup accounts', async () => {
        vi.spyOn(db.knex, 'transaction').mockResolvedValueOnce({ id: 42 });
        const track = vi.spyOn(productTracking, 'track');
        const group = vi.spyOn(productTracking, 'identifyAccountGroup');

        await accountService.createAccount({ name: 'Test', isSignup: false, acquisition: { acquisition_utm_source: 'facebook' } });

        expect(track).not.toHaveBeenCalled();
        expect(group).not.toHaveBeenCalled();
    });
    it('adds permitted ad context to the existing event without identifying it on the company', async () => {
        const account = { id: 42, name: 'Test account' };
        vi.spyOn(db.knex, 'transaction').mockResolvedValueOnce(account);
        const track = vi.spyOn(productTracking, 'track').mockImplementation(() => undefined);
        const group = vi.spyOn(productTracking, 'identifyAccountGroup').mockImplementation(() => undefined);
        const advertising = {
            is_advertising_allowed: true as const,
            is_advertising_gpc: false as const,
            advertising_consent_method: 'explicit' as const,
            advertising_consent_timestamp: '2026-10-20T12:00:00Z',
            advertising_fbc: 'fb.1.1792497600000.synthetic'
        };
        await accountService.createAccount({ name: 'Test', advertising });
        expect(track).toHaveBeenCalledExactlyOnceWith({ name: 'auth:account_create', team: account, eventProperties: advertising });
        expect(group).not.toHaveBeenCalled();
    });
});
