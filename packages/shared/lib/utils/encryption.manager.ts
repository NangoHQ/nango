import utils from 'node:util';
import crypto from 'crypto';
import { getLogger, Encryption } from '@nangohq/utils';
import type { Config as ProviderConfig } from '../models/Provider';
import type { DBConfig } from '../models/Generic.js';
import type { DBEnvironment, DBEnvironmentVariable } from '@nangohq/types';
import type { Connection, StoredConnection } from '../models/Connection.js';
import db from '@nangohq/database';
import { hashSecretKey } from '../services/environment.service.js';

const logger = getLogger('Encryption.Manager');

export const pbkdf2 = utils.promisify(crypto.pbkdf2);
export const ENCRYPTION_KEY = process.env['NANGO_ENCRYPTION_KEY'] || '';

export class EncryptionManager extends Encryption {
    private keySalt = 'X89FHEGqR3yNK0+v7rPWxQ==';

    public shouldEncrypt(): boolean {
        return Boolean(this?.key && this.key.length > 0);
    }

    public async encryptEnvironment(environment: DBEnvironment) {
        if (!this.shouldEncrypt()) {
            return environment;
        }

        const encryptedEnvironment: DBEnvironment = Object.assign({}, environment);

        const [encryptedClientSecret, iv, authTag] = this.encrypt(environment.secret_key);
        encryptedEnvironment.secret_key_hashed = await hashSecretKey(environment.secret_key);
        encryptedEnvironment.secret_key = encryptedClientSecret;
        encryptedEnvironment.secret_key_iv = iv;
        encryptedEnvironment.secret_key_tag = authTag;

        if (encryptedEnvironment.pending_secret_key) {
            const [encryptedPendingClientSecret, pendingIv, pendingAuthTag] = this.encrypt(encryptedEnvironment.pending_secret_key);
            encryptedEnvironment.pending_secret_key = encryptedPendingClientSecret;
            encryptedEnvironment.pending_secret_key_iv = pendingIv;
            encryptedEnvironment.pending_secret_key_tag = pendingAuthTag;
        }

        return encryptedEnvironment;
    }

    public decryptEnvironment<TEnv extends DBEnvironment | null>(environment: TEnv): TEnv {
        // Check if the individual row is encrypted.
        if (environment == null || environment.secret_key_iv == null || environment.secret_key_tag == null) {
            return environment;
        }

        const decryptedEnvironment: TEnv = Object.assign({}, environment);

        decryptedEnvironment.secret_key = this.decrypt(environment.secret_key, environment.secret_key_iv, environment.secret_key_tag);

        if (decryptedEnvironment.pending_secret_key) {
            decryptedEnvironment.pending_secret_key = this.decrypt(
                environment.pending_secret_key as string,
                environment.pending_secret_key_iv as string,
                environment.pending_secret_key_tag as string
            );
        }

        return decryptedEnvironment;
    }

    public encryptConnection(
        connection: Omit<Connection, 'created_at' | 'updated_at' | 'end_user_id'>
    ): Omit<StoredConnection, 'created_at' | 'updated_at' | 'end_user_id'> {
        if (!this.shouldEncrypt()) {
            return connection;
        }

        const storedConnection = Object.assign({}, connection) as Omit<StoredConnection, 'created_at' | 'updated_at' | 'end_user_id'>;

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

    public encryptEnvironmentVariables(environmentVariables: DBEnvironmentVariable[]): DBEnvironmentVariable[] {
        if (!this.shouldEncrypt()) {
            return environmentVariables;
        }

        const encryptedEnvironmentVariables: DBEnvironmentVariable[] = Object.assign([], environmentVariables);

        for (const environmentVariable of encryptedEnvironmentVariables) {
            const [encryptedValue, iv, authTag] = this.encrypt(environmentVariable.value);
            environmentVariable.value = encryptedValue;
            environmentVariable.value_iv = iv;
            environmentVariable.value_tag = authTag;
        }

        return encryptedEnvironmentVariables;
    }

    public decryptEnvironmentVariables(environmentVariables: DBEnvironmentVariable[] | null): DBEnvironmentVariable[] | null {
        if (environmentVariables === null) {
            return environmentVariables;
        }

        const decryptedEnvironmentVariables: DBEnvironmentVariable[] = Object.assign([], environmentVariables);

        for (const environmentVariable of decryptedEnvironmentVariables) {
            if (environmentVariable.value_iv == null || environmentVariable.value_tag == null) {
                continue;
            }

            environmentVariable.value = this.decrypt(environmentVariable.value, environmentVariable.value_iv, environmentVariable.value_tag);
        }

        return decryptedEnvironmentVariables;
    }

    public encryptProviderConfig(config: ProviderConfig): ProviderConfig {
        if (!this.shouldEncrypt()) {
            return config;
        }

        const encryptedConfig: ProviderConfig = Object.assign({}, config);

        if (!config.oauth_client_secret) {
            return config;
        }

        const [encryptedClientSecret, iv, authTag] = this.encrypt(config.oauth_client_secret);
        encryptedConfig.oauth_client_secret = encryptedClientSecret;
        encryptedConfig.oauth_client_secret_iv = iv;
        encryptedConfig.oauth_client_secret_tag = authTag;

        if (config.custom) {
            const [encryptedValue, iv, authTag] = this.encrypt(JSON.stringify(config.custom));
            encryptedConfig.custom = { encryptedValue, iv: iv, authTag: authTag };
        }

        return encryptedConfig;
    }

    public decryptProviderConfig(config: ProviderConfig | null): ProviderConfig | null {
        // Check if the individual row is encrypted.
        if (config == null || config.oauth_client_secret_iv == null || config.oauth_client_secret_tag == null) {
            return config;
        }

        const decryptedConfig: ProviderConfig = Object.assign({}, config);

        decryptedConfig.oauth_client_secret = this.decrypt(config.oauth_client_secret, config.oauth_client_secret_iv, config.oauth_client_secret_tag);

        if (decryptedConfig.custom && config.custom) {
            decryptedConfig.custom = JSON.parse(
                this.decrypt(config.custom['encryptedValue'] as string, config.custom['iv'] as string, config.custom['authTag'] as string)
            );
        }
        return decryptedConfig;
    }

    private async saveDbConfig(dbConfig: DBConfig) {
        await db.knex.from<DBConfig>(`_nango_db_config`).del();
        await db.knex.from<DBConfig>(`_nango_db_config`).insert(dbConfig);
    }

    private async hashEncryptionKey(key: string, salt: string): Promise<string> {
        const keyBuffer = await pbkdf2(key, salt, 310000, 32, 'sha256');
        return keyBuffer.toString(this.encoding);
    }

    /**
     * Determine the Database encryption status
     */
    public async encryptionStatus(
        dbConfig?: DBConfig
    ): Promise<'disabled' | 'not_started' | 'require_rotation' | 'require_decryption' | 'done' | 'incomplete'> {
        if (!dbConfig) {
            if (!this.key) {
                return 'disabled';
            } else {
                return 'not_started';
            }
        } else if (!this.key) {
            return 'require_decryption';
        }

        const previousEncryptionKeyHash = dbConfig.encryption_key_hash;
        const encryptionKeyHash = await this.hashEncryptionKey(this.key, this.keySalt);
        if (previousEncryptionKeyHash !== encryptionKeyHash) {
            return 'require_rotation';
        }
        return dbConfig.encryption_complete ? 'done' : 'incomplete';
    }

    public async encryptDatabaseIfNeeded() {
        const dbConfig = await db.knex.select<DBConfig>('*').from<DBConfig>('_nango_db_config').first();
        const status = await this.encryptionStatus(dbConfig);
        const encryptionKeyHash = this.key ? await this.hashEncryptionKey(this.key, this.keySalt) : null;

        if (status === 'disabled') {
            return;
        }
        if (status === 'done') {
            return;
        }
        if (status === 'require_rotation') {
            throw new Error('Rotation of NANGO_ENCRYPTION_KEY is not supported.');
        }
        if (status === 'require_decryption') {
            throw new Error('A previously set NANGO_ENCRYPTION_KEY has been removed from your environment variables.');
        }
        if (status === 'not_started') {
            logger.info('🔐 Encryption key has been set. Encrypting database...');
            await this.saveDbConfig({ encryption_key_hash: encryptionKeyHash, encryption_complete: false });
        }
        if (status === 'incomplete') {
            logger.info('🔐 Previously started database encryption is incomplete. Continuing encryption of database...');
        }

        await this.encryptDatabase();
        await this.saveDbConfig({ encryption_key_hash: encryptionKeyHash, encryption_complete: true });
    }

    private async encryptDatabase() {
        logger.info('🔐⚙️ Starting encryption of database...');

        const environments: DBEnvironment[] = await db.knex.select('*').from<DBEnvironment>(`_nango_environments`);

        for (let environment of environments) {
            if (environment.secret_key_iv && environment.secret_key_tag) {
                continue;
            }

            environment = await this.encryptEnvironment(environment);
            await db.knex.from<DBEnvironment>(`_nango_environments`).where({ id: environment.id }).update(environment);
        }

        const connections: Connection[] = await db.knex.select('*').from<Connection>(`_nango_connections`);

        for (const connection of connections) {
            if (connection.credentials_iv && connection.credentials_tag) {
                continue;
            }

            const storedConnection = this.encryptConnection(connection);
            await db.knex.from<StoredConnection>(`_nango_connections`).where({ id: storedConnection.id! }).update(storedConnection);
        }

        const providerConfigs: ProviderConfig[] = await db.knex.select('*').from<ProviderConfig>(`_nango_configs`);

        for (let providerConfig of providerConfigs) {
            if (providerConfig.oauth_client_secret_iv && providerConfig.oauth_client_secret_tag) {
                continue;
            }

            providerConfig = this.encryptProviderConfig(providerConfig);
            await db.knex.from<ProviderConfig>(`_nango_configs`).where({ id: providerConfig.id! }).update(providerConfig);
        }

        const environmentVariables: DBEnvironmentVariable[] = await db.knex.select('*').from<DBEnvironmentVariable>(`_nango_environment_variables`);

        for (const environmentVariable of environmentVariables) {
            if (environmentVariable.value_iv && environmentVariable.value_tag) {
                continue;
            }

            const [encryptedValue, iv, authTag] = this.encrypt(environmentVariable.value);
            environmentVariable.value = encryptedValue;
            environmentVariable.value_iv = iv;
            environmentVariable.value_tag = authTag;

            await db.knex
                .from<DBEnvironmentVariable>(`_nango_environment_variables`)
                .where({ id: environmentVariable.id as number })
                .update(environmentVariable);
        }

        logger.info('🔐✅ Encryption of database complete!');
    }
}

export default new EncryptionManager(ENCRYPTION_KEY);
