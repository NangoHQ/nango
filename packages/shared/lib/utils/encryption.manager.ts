import crypto, { CipherGCMTypes } from 'crypto';
import logger from '../logger/console.js';
import type { Config as ProviderConfig } from '../models/Provider';
import type { DBConfig } from '../models/Generic.js';
import type { Environment } from '../models/Environment.js';
import type { EnvironmentVariable } from '../models/EnvironmentVariable.js';
import type { Connection, ApiConnection, StoredConnection } from '../models/Connection.js';
import type { DataRecord, DataRecordWithMetadata, RecordWrapCustomerFacingDataRecord } from '../models/Sync.js';
import db from '../db/database.js';
import util from 'util';

interface DataRecordJson {
    encryptedValue: string;
    [key: string]: any;
}

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

    public encryptEnvironment(environment: Environment) {
        if (!this.shouldEncrypt()) {
            return environment;
        }

        const encryptedEnvironment: Environment = Object.assign({}, environment);

        const [encryptedClientSecret, iv, authTag] = this.encrypt(encryptedEnvironment.secret_key);
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

    public decryptEnvironment(environment: Environment | null): Environment | null {
        // Check if the individual row is encrypted.
        if (environment == null || environment.secret_key_iv == null || environment.secret_key_tag == null) {
            return environment;
        }

        const decryptedEnvironment: Environment = Object.assign({}, environment);

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

    public encryptApiConnection(connection: ApiConnection): StoredConnection {
        if (!this.shouldEncrypt()) {
            return connection as StoredConnection;
        }

        const storedConnection: StoredConnection = Object.assign({}, connection) as StoredConnection;

        const [encryptedClientSecret, iv, authTag] = this.encrypt(JSON.stringify(connection.credentials));
        const encryptedCreds = { encrypted_credentials: encryptedClientSecret };

        storedConnection.credentials = encryptedCreds;
        storedConnection.credentials_iv = iv;
        storedConnection.credentials_tag = authTag;

        return storedConnection;
    }

    public encryptConnection(connection: Connection): StoredConnection {
        if (!this.shouldEncrypt()) {
            return connection as StoredConnection;
        }

        const storedConnection: StoredConnection = Object.assign({}, connection) as StoredConnection;

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

    public encryptEnvironmentVariables(environmentVariables: EnvironmentVariable[]): EnvironmentVariable[] {
        if (!this.shouldEncrypt()) {
            return environmentVariables;
        }

        const encryptedEnvironmentVariables: EnvironmentVariable[] = Object.assign([], environmentVariables);

        for (const environmentVariable of encryptedEnvironmentVariables) {
            const [encryptedValue, iv, authTag] = this.encrypt(environmentVariable.value);
            environmentVariable.value = encryptedValue;
            environmentVariable.value_iv = iv;
            environmentVariable.value_tag = authTag;
        }

        return encryptedEnvironmentVariables;
    }

    public decryptEnvironmentVariables(environmentVariables: EnvironmentVariable[] | null): EnvironmentVariable[] | null {
        if (environmentVariables === null) {
            return environmentVariables;
        }

        const decryptedEnvironmentVariables: EnvironmentVariable[] = Object.assign([], environmentVariables);

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

    public encryptDataRecords(dataRecords: DataRecord[]): DataRecord[] {
        if (!this.shouldEncrypt()) {
            return dataRecords;
        }

        const encryptedDataRecords: DataRecord[] = Object.assign([], dataRecords);

        for (const dataRecord of encryptedDataRecords) {
            const [encryptedValue, iv, authTag] = this.encrypt(JSON.stringify(dataRecord.json));
            dataRecord.json = { encryptedValue, iv, authTag };
        }

        return encryptedDataRecords;
    }

    public decryptDataRecords(dataRecords: DataRecord[] | null, field = 'json'): DataRecordWithMetadata[] | RecordWrapCustomerFacingDataRecord | null {
        if (dataRecords === null) {
            return dataRecords;
        }

        const decryptedDataRecords: DataRecord[] = [];

        for (const dataRecord of dataRecords) {
            const record = dataRecord[field] as DataRecordJson;

            if (!record.encryptedValue) {
                decryptedDataRecords.push(dataRecord);
                continue;
            }

            const { encryptedValue, iv, authTag } = record;

            const decryptedString = this.decrypt(encryptedValue, iv, authTag);

            let updatedRecord = {
                ...JSON.parse(decryptedString)
            };

            if (record['_nango_metadata']) {
                updatedRecord['_nango_metadata'] = record['_nango_metadata'];
                decryptedDataRecords.push({ [field]: updatedRecord } as DataRecord);
            } else {
                const { record: _record, ...rest } = dataRecord;
                updatedRecord = {
                    ...rest,
                    record: updatedRecord
                };
                decryptedDataRecords.push(updatedRecord as DataRecord);
            }
        }

        return decryptedDataRecords as unknown as DataRecordWithMetadata[] | RecordWrapCustomerFacingDataRecord;
    }

    public async encryptAllDataRecords(): Promise<void> {
        const chunkSize = 1000;
        const concurrencyLimit = 5;

        const encryptAndSave = async (tableName: string, offset: number) => {
            const dataRecords: DataRecord[] = await db.knex.withSchema(db.schema()).select('*').from<DataRecord>(tableName).limit(chunkSize).offset(offset);

            if (dataRecords.length === 0) {
                return false;
            }

            const updatePromises = dataRecords.map((dataRecord) =>
                db.knex.transaction(async (trx) => {
                    if ((dataRecord.json as Record<string, string>)['encryptedValue']) {
                        return;
                    }

                    const [encryptedValue, iv, authTag] = this.encrypt(JSON.stringify(dataRecord.json));
                    dataRecord.json = { encryptedValue, iv, authTag };

                    await db.knex.withSchema(db.schema()).from<DataRecord>(tableName).where('id', dataRecord.id).update(dataRecord).transacting(trx);

                    await trx.commit();
                })
            );

            await Promise.all(updatePromises.slice(0, concurrencyLimit));
            return true;
        };

        let offset = 0;
        while (await encryptAndSave('_nango_sync_data_records', offset)) {
            offset += chunkSize;
        }

        offset = 0;
        while (await encryptAndSave('_nango_sync_data_records_deletes', offset)) {
            offset += chunkSize;
        }
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

        const environments: Environment[] = await db.knex.withSchema(db.schema()).select('*').from<Environment>(`_nango_environments`);

        for (let environment of environments) {
            if (environment.secret_key_iv && environment.secret_key_tag) {
                continue;
            }

            environment = this.encryptEnvironment(environment);
            await db.knex.withSchema(db.schema()).from<Environment>(`_nango_environments`).where({ id: environment.id }).update(environment);
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

        const environmentVariables: EnvironmentVariable[] = await db.knex
            .withSchema(db.schema())
            .select('*')
            .from<EnvironmentVariable>(`_nango_environment_variables`);

        for (const environmentVariable of environmentVariables) {
            if (environmentVariable.value_iv && environmentVariable.value_tag) {
                continue;
            }

            const [encryptedValue, iv, authTag] = this.encrypt(environmentVariable.value);
            environmentVariable.value = encryptedValue;
            environmentVariable.value_iv = iv;
            environmentVariable.value_tag = authTag;

            await db.knex
                .withSchema(db.schema())
                .from<EnvironmentVariable>(`_nango_environment_variables`)
                .where({ id: environmentVariable.id as number })
                .update(environmentVariable);
        }

        await this.encryptAllDataRecords();

        logger.info('🔐✅ Encryption of database complete!');
    }
}

export default new EncryptionManager(process.env['NANGO_ENCRYPTION_KEY']);
