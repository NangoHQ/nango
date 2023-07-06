import crypto, { CipherGCMTypes } from 'crypto';
import logger from '../logger/console.js';
import type { Config as ProviderConfig } from '../models/Provider';
import type { DBConfig } from '../models/Generic.js';
import type { Account } from '../models/Admin.js';
import type { Environment } from '../models/Environment.js';
import type { Connection, StoredConnection } from '../models/Connection.js';
import db from '../db/database.js';
import util from 'util';

class EncryptionManager {
    private key: string | undefined;
    private algo: CipherGCMTypes = 'aes-256-gcm';
    private encoding: BufferEncoding = 'base64';
    private encryptionKeyByteLength = 32;
    private keySalt = 'X89FHEGqR3yNK0+v7rPWxQ==';

    constructor(key: string | undefined) {
        this.key = key;

        if (key && Buffer.from(key, this.encoding).byteLength != this.encryptionKeyByteLength) {
            throw new Error('Encryption key must be base64-encoded and 256-bit long.');
        }
    }

    private shouldEncrypt(): boolean {
        return Boolean((this?.key as string) && (this.key as string).length > 0);
    }

    private encrypt(str: string): [string, string | null, string | null] {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(this.algo, Buffer.from(this.key!, this.encoding), iv);
        let enc = cipher.update(str, 'utf8', this.encoding);
        enc += cipher.final(this.encoding);
        return [enc, iv.toString(this.encoding), cipher.getAuthTag().toString(this.encoding)];
    }

    private decrypt(enc: string, iv: string, authTag: string): string {
        const decipher = crypto.createDecipheriv(this.algo, Buffer.from(this.key!, this.encoding), Buffer.from(iv, this.encoding));
        decipher.setAuthTag(Buffer.from(authTag, this.encoding));
        let str = decipher.update(enc, this.encoding, 'utf8');
        str += decipher.final('utf8');
        return str;
    }

    public encryptAccount(account: Account): Account {
        if (!this.shouldEncrypt()) {
            return account;
        }

        const encryptedAccount: Account = Object.assign({}, account);

        const [encryptedClientSecret, iv, authTag] = this.encrypt(encryptedAccount.secret_key);
        encryptedAccount.secret_key = encryptedClientSecret;
        encryptedAccount.secret_key_iv = iv;
        encryptedAccount.secret_key_tag = authTag;

        return encryptedAccount;
    }

    public decryptEnvironment(environment: Environment | null): Environment | null {
        // Check if the individual row is encrypted.
        if (environment == null || environment.secret_key_iv == null || environment.secret_key_tag == null) {
            return environment;
        }

        const decryptedEnvironment: Environment = Object.assign({}, environment);

        decryptedEnvironment.secret_key = this.decrypt(environment.secret_key, environment.secret_key_iv, environment.secret_key_tag);
        return decryptedEnvironment;
    }

    public decryptAccount(account: Account | null): Account | null {
        // Check if the individual row is encrypted.
        if (account == null || account.secret_key_iv == null || account.secret_key_tag == null) {
            return account;
        }

        const decryptedAccount: Account = Object.assign({}, account);

        decryptedAccount.secret_key = this.decrypt(account.secret_key, account.secret_key_iv, account.secret_key_tag);
        return decryptedAccount;
    }

    public encryptConnection(connection: Connection): StoredConnection {
        if (!this.shouldEncrypt()) {
            return connection as StoredConnection;
        }

        const storedConnection: StoredConnection = Object.assign({}, connection);

        const [encryptedClientSecret, iv, authTag] = this.encrypt(JSON.stringify(connection.credentials));
        const encryptedCreds = { encrypted_credentials: encryptedClientSecret };

        storedConnection.credentials = encryptedCreds;
        storedConnection.credentials_iv = iv;
        storedConnection.credentials_tag = authTag;

        return storedConnection;
    }

    public decryptConnection(connection: StoredConnection | null): Connection | null {
        // Check if the individual row is encrypted.
        if (connection == null || connection.credentials_iv == null || connection.credentials_tag == null) {
            return connection as Connection;
        }

        const decryptedConnection: StoredConnection = Object.assign({}, connection);

        decryptedConnection.credentials = JSON.parse(
            this.decrypt(connection.credentials['encrypted_credentials'], connection.credentials_iv, connection.credentials_tag)
        );

        return decryptedConnection as Connection;
    }

    public encryptProviderConfig(config: ProviderConfig): ProviderConfig {
        if (!this.shouldEncrypt()) {
            return config;
        }

        const encryptedConfig: ProviderConfig = Object.assign({}, config);

        const [encryptedClientSecret, iv, authTag] = this.encrypt(config.oauth_client_secret);
        encryptedConfig.oauth_client_secret = encryptedClientSecret;
        encryptedConfig.oauth_client_secret_iv = iv;
        encryptedConfig.oauth_client_secret_tag = authTag;

        return encryptedConfig;
    }

    public decryptProviderConfig(config: ProviderConfig | null): ProviderConfig | null {
        // Check if the individual row is encrypted.
        if (config == null || config.oauth_client_secret_iv == null || config.oauth_client_secret_tag == null) {
            return config;
        }

        const decryptedConfig: ProviderConfig = Object.assign({}, config);

        decryptedConfig.oauth_client_secret = this.decrypt(config.oauth_client_secret, config.oauth_client_secret_iv, config.oauth_client_secret_tag);
        return decryptedConfig;
    }

    private async saveDbConfig(dbConfig: DBConfig) {
        await db.knex.withSchema(db.schema()).from<DBConfig>(`_nango_db_config`).del();
        await db.knex.withSchema(db.schema()).from<DBConfig>(`_nango_db_config`).insert(dbConfig);
    }

    private async hashEncryptionKey(key: string, salt: string): Promise<string> {
        const keyBuffer = await util.promisify(crypto.pbkdf2)(key, salt, 310000, 32, 'sha256');
        return keyBuffer.toString(this.encoding);
    }

    public async encryptDatabaseIfNeeded() {
        const dbConfig: DBConfig | null = await db.knex.withSchema(db.schema()).first().from<DBConfig>('_nango_db_config');
        const previousEncryptionKeyHash = dbConfig?.encryption_key_hash;
        const encryptionKeyHash = this.key ? await this.hashEncryptionKey(this.key, this.keySalt) : null;

        const isEncryptionKeyNew = dbConfig == null && this.key;
        const isEncryptionIncomplete = dbConfig != null && previousEncryptionKeyHash === encryptionKeyHash && dbConfig.encryption_complete == false;

        if (isEncryptionKeyNew || isEncryptionIncomplete) {
            if (isEncryptionKeyNew) {
                logger.info('🔐 Encryption key has been set. Encrypting database...');
                await this.saveDbConfig({ encryption_key_hash: encryptionKeyHash, encryption_complete: false });
            } else if (isEncryptionIncomplete) {
                logger.info('🔐 Previously started database encryption is incomplete. Continuing encryption of database...');
            }

            await this.encryptDatabase();
            await this.saveDbConfig({ encryption_key_hash: encryptionKeyHash, encryption_complete: true });
            return;
        }

        const isEncryptionKeyChanged = dbConfig?.encryption_key_hash != null && previousEncryptionKeyHash !== encryptionKeyHash;
        if (isEncryptionKeyChanged) {
            throw new Error('You cannot edit or remove the encryption key once it has been set.');
        }
    }

    private async encryptDatabase() {
        logger.info('🔐⚙️ Starting encryption of database...');

        const accounts: Account[] = await db.knex.withSchema(db.schema()).select('*').from<Account>(`_nango_accounts`);

        for (let account of accounts) {
            if (account.secret_key_iv && account.secret_key_tag) {
                continue;
            }

            account = this.encryptAccount(account);
            await db.knex.withSchema(db.schema()).from<Account>(`_nango_accounts`).where({ id: account.id }).update(account);
        }

        const connections: Connection[] = await db.knex.withSchema(db.schema()).select('*').from<Connection>(`_nango_connections`);

        for (const connection of connections) {
            if (connection.credentials_iv && connection.credentials_tag) {
                continue;
            }

            const storedConnection = this.encryptConnection(connection);
            await db.knex.withSchema(db.schema()).from<StoredConnection>(`_nango_connections`).where({ id: storedConnection.id! }).update(storedConnection);
        }

        const providerConfigs: ProviderConfig[] = await db.knex.withSchema(db.schema()).select('*').from<ProviderConfig>(`_nango_configs`);

        for (let providerConfig of providerConfigs) {
            if (providerConfig.oauth_client_secret_iv && providerConfig.oauth_client_secret_tag) {
                continue;
            }

            providerConfig = this.encryptProviderConfig(providerConfig);
            await db.knex.withSchema(db.schema()).from<ProviderConfig>(`_nango_configs`).where({ id: providerConfig.id! }).update(providerConfig);
        }

        logger.info('🔐✅ Encryption of database complete!');
    }
}

export default new EncryptionManager(process.env['NANGO_ENCRYPTION_KEY']);
