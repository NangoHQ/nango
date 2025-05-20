import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import encryptionManager, { EncryptionManager } from './encryption.manager';
import { seedAccountEnvAndUser } from '../seeders/index.js';
import environmentService from '../services/environment.service';

describe('encryption', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    describe('status', () => {
        it('should report disabled if no key and no previous key', async () => {
            const res = await new EncryptionManager('').encryptionStatus();
            expect(res).toBe('disabled');
        });

        it('should report not_started if key and no previous key', async () => {
            const res = await new EncryptionManager('aHcTnJX5yaDJHF/EJLc6IMFSo2+aiz1hPsTkpsufxa0=').encryptionStatus();
            expect(res).toBe('not_started');
        });

        it('should report require_decryption if no key and one previous key', async () => {
            const res = await new EncryptionManager('').encryptionStatus({ encryption_complete: true, encryption_key_hash: 'erer' });
            expect(res).toBe('require_decryption');
        });

        it('should report require_rotation if different keys', async () => {
            const res = await new EncryptionManager('aHcTnJX5yaDJHF/EJLc6IMFSo2+aiz1hPsTkpsufxa0=').encryptionStatus({
                encryption_complete: true,
                encryption_key_hash: 'erer'
            });
            expect(res).toBe('require_rotation');
        });

        it('should report incomplete if same key but not finished', async () => {
            const res = await new EncryptionManager('aHcTnJX5yaDJHF/EJLc6IMFSo2+aiz1hPsTkpsufxa0=').encryptionStatus({
                encryption_complete: false,
                encryption_key_hash: 'sM+EkzNi7o4Crw3cVfg01jBbmSEAfDdmTzYWoxbryvk='
            });
            expect(res).toBe('incomplete');
        });

        it('should report done if same key and complete', async () => {
            const res = await new EncryptionManager('aHcTnJX5yaDJHF/EJLc6IMFSo2+aiz1hPsTkpsufxa0=').encryptionStatus({
                encryption_complete: true,
                encryption_key_hash: 'sM+EkzNi7o4Crw3cVfg01jBbmSEAfDdmTzYWoxbryvk='
            });
            expect(res).toBe('done');
        });
    });

    describe('encryption', () => {
        it('should encrypt environment', async () => {
            // we create a different schema because we have only one DB for all tests
            db.knex.client.config.searchPath = 'nango_encrypt';
            db.schema = () => 'nango_encrypt';

            await multipleMigrations();

            // Disable encryption manually since it's set by default
            // @ts-expect-error Modify the key on the fly
            encryptionManager.key = '';
            await db.knex.from(`_nango_db_config`).del();

            const { env } = await seedAccountEnvAndUser();
            expect(env.secret_key_iv).toBeNull();
            expect(env.secret_key_hashed).toBe(env.secret_key);

            // Re-enable encryption
            // @ts-expect-error Modify the key on the fly
            encryptionManager.key = 'aHcTnJX5yaDJHF/EJLc6IMFSo2+aiz1hPsTkpsufxa0=';
            await encryptionManager.encryptDatabaseIfNeeded();

            const envAfterEnc = (await environmentService.getRawById(env.id))!;
            expect(envAfterEnc.secret_key_iv).not.toBeNull();
            expect(envAfterEnc.secret_key_tag).not.toBeNull();
            expect(envAfterEnc.secret_key).not.toBe(env.secret_key);
            expect(envAfterEnc.secret_key_hashed).not.toBe(env.secret_key);
        });
    });
});
