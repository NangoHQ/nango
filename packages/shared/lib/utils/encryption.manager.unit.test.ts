import { describe, expect, it } from 'vitest';

import encryptionManager from './encryption.manager';
import { getTestConnection } from '../services/connections/utils.test';

import type { DBConnection } from '@nangohq/types';

describe('encryption', () => {
    describe('decryption', () => {
        it('should return connection', () => {
            const res = encryptionManager.decryptConnection(getTestConnection() as DBConnection);
            expect(res.credentials).toStrictEqual({
                apiKey: 'random_token',
                type: 'API_KEY'
            });
        });

        it('should return proper connection if json', () => {
            const test = getTestConnection();
            const res = encryptionManager.decryptConnection(JSON.parse(JSON.stringify(test)) as DBConnection);
            expect(res.created_at).toStrictEqual(new Date(test.created_at));
        });
    });
});
