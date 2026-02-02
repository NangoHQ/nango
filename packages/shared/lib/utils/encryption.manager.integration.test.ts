import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import encryptionManager, { EncryptionManager } from './encryption.manager.js';
import { seedAccountEnvAndUser } from '../seeders/index.js';
import environmentService from '../services/environment.service.js';
import secretService from '../services/secret.service.js';

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
        it('should encrypt secrets', async () => {
            // we create a different schema because we have only one DB for all tests
            db.knex.client.config.searchPath = 'nango_encrypt';
            db.schema = () => 'nango_encrypt';

            await multipleMigrations();

            // Disable encryption manually since it's set by default
            // @ts-expect-error Modify the key on the fly
            encryptionManager.key = '';
            await db.knex.from(`_nango_db_config`).del();

            const { env } = await seedAccountEnvAndUser();
            expect(env.secret_key).toBeUUID();

            const defaultSecret = (await secretService.getDefaultSecretForEnv(db.knex, env.id)).unwrap();
            expect(defaultSecret.secret).toBeUUID();
            expect(defaultSecret.secret).toEqual(env.secret_key);
            expect(defaultSecret.iv).toEqual('');
            expect(defaultSecret.tag).toEqual('');

            // Re-enable encryption
            // @ts-expect-error Modify the key on the fly
            encryptionManager.key = 'aHcTnJX5yaDJHF/EJLc6IMFSo2+aiz1hPsTkpsufxa0=';
            await encryptionManager.encryptDatabaseIfNeeded();

            const envAfterEnc = (await environmentService.getById(env.id))!;
            expect(envAfterEnc.secret_key).toEqual(env.secret_key);

            const defaultSecretAfterEnc = (await secretService.getDefaultSecretForEnv(db.knex, env.id)).unwrap();
            expect(defaultSecretAfterEnc.secret).toBeUUID();
            expect(defaultSecretAfterEnc.secret).toEqual(env.secret_key);
        });
    });
});
