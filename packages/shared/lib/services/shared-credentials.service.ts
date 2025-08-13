import db from '@nangohq/database';
import { getProvider } from '@nangohq/providers';
import { Err, Ok, nanoid } from '@nangohq/utils';

import configService from './config.service.js';
import encryptionManager from '../utils/encryption.manager.js';

import type { Config as ProviderConfig } from '../models/Provider.js';
import type { DBSharedCredentials, IntegrationConfig, Provider, Result, SharedCredentialsBodyInput } from '@nangohq/types';

class SharedCredentialsService {
    async createPreprovisionedProvider(providerName: string, environment_id: number, provider: Provider): Promise<Result<IntegrationConfig>> {
        try {
            const sharedCredentialsResult = await this.getSharedCredentialsbyName(providerName);
            if (sharedCredentialsResult.isErr()) {
                return Err(new Error('shared_credentials_not_found'));
            }

            const sharedCredentials = sharedCredentialsResult.value;

            const exists = await db.knex
                .count<{ count: string }>('*')
                .from<ProviderConfig>(`_nango_configs`)
                .where({ provider: providerName, environment_id, deleted: false })
                .first();

            const config = await configService.createProviderConfig(
                {
                    environment_id,
                    unique_key: exists?.count === '0' ? providerName : `${providerName}-${nanoid(4).toLocaleLowerCase()}`,
                    provider: providerName,
                    forward_webhooks: true,
                    shared_credentials_id: sharedCredentials.id
                },
                provider
            );

            if (!config) {
                return Err(new Error('unknown_provider_config'));
            }

            return Ok(config);
        } catch (err) {
            return Err(new Error(`Failed to create shared credentials: ${err instanceof Error ? err.message : 'Unknown error'}`));
        }
    }

    async getPreConfiguredProviderScopes(): Promise<Result<Record<string, { scopes: string[]; preConfigured: boolean }>>> {
        try {
            const sharedCredentials = await db.knex
                .select<{ name: string; scopes: string[] | null }[]>(['name', db.knex.raw(`string_to_array(credentials->>'oauth_scopes', ',') as scopes`)])
                .from<DBSharedCredentials>('providers_shared_credentials')
                .whereNotNull('credentials');

            const preConfiguredProviders: Record<string, { scopes: string[]; preConfigured: boolean }> = {};

            for (const cred of sharedCredentials) {
                const scopes = cred.scopes ? cred.scopes.map((scope: string) => scope.trim()) : [];
                preConfiguredProviders[cred.name] = { scopes, preConfigured: true };
            }
            return Ok(preConfiguredProviders);
        } catch (err) {
            return Err(new Error(`Failed to get pre-configured provider scopes: ${err instanceof Error ? err.message : 'Unknown error'}`));
        }
    }

    async getSharedCredentialsbyName(provider: string): Promise<Result<DBSharedCredentials>> {
        try {
            const sharedCredentials = await db.knex.select('*').from('providers_shared_credentials').where('name', provider).first();

            if (!sharedCredentials) {
                return Err(new Error('not_found'));
            }

            return Ok(sharedCredentials);
        } catch (err) {
            return Err(new Error(`Failed to get shared credentials: ${err instanceof Error ? err.message : 'Unknown error'}`));
        }
    }

    async getSharedCredentialsById(id: string): Promise<Result<DBSharedCredentials>> {
        try {
            const sharedCredentials = await db.knex.select('*').from('providers_shared_credentials').where('id', parseInt(id)).first();

            if (!sharedCredentials) {
                return Err(new Error('not_found'));
            }

            const credentials = sharedCredentials.credentials;
            let decryptedClientSecret = credentials.oauth_client_secret;

            if (credentials.oauth_client_secret_iv && credentials.oauth_client_secret_tag) {
                decryptedClientSecret = encryptionManager.decryptSync(
                    credentials.oauth_client_secret,
                    credentials.oauth_client_secret_iv,
                    credentials.oauth_client_secret_tag
                );
            }

            return Ok({
                ...sharedCredentials,
                credentials: {
                    ...credentials,
                    oauth_client_secret: decryptedClientSecret
                }
            });
        } catch (err) {
            return Err(new Error(`Failed to get shared credentials: ${err instanceof Error ? err.message : 'Unknown error'}`));
        }
    }

    async createSharedCredentials(config: SharedCredentialsBodyInput): Promise<Result<number>> {
        const provider = getProvider(config.name);
        if (!provider) {
            return Err(new Error('invalid_provider'));
        }

        const configForEncryption = {
            oauth_client_id: config.client_id,
            oauth_client_secret: config.client_secret,
            oauth_scopes: config.scopes || ''
        };

        const configToInsert = encryptionManager.encryptProviderConfig(configForEncryption as ProviderConfig);

        let result: DBSharedCredentials[];
        try {
            result = await db.knex
                .insert({
                    name: config.name,
                    credentials: configToInsert
                })
                .into('providers_shared_credentials')
                .onConflict('name')
                .ignore()
                .returning('*');
        } catch (err) {
            return Err(new Error(`Failed to create shared credentials: ${err instanceof Error ? err.message : 'Unknown error'}`));
        }

        if (result.length === 0) {
            return Err(new Error('shared_credentials_already_exists'));
        }

        const createdProvider: DBSharedCredentials = result[0]!;

        return Ok(createdProvider.id);
    }

    async editSharedCredentials(id: string, config: SharedCredentialsBodyInput): Promise<Result<number>> {
        try {
            const provider = getProvider(config.name);
            if (!provider) {
                return Err(new Error('invalid_provider'));
            }

            const configForEncryption = {
                oauth_client_id: config.client_id,
                oauth_client_secret: config.client_secret,
                oauth_scopes: config.scopes || ''
            };

            const existingRecord = await db.knex
                .select('name')
                .from('providers_shared_credentials')
                .where({ id: parseInt(id) })
                .first();
            if (!existingRecord) {
                return Err(new Error('shared_credentials_provider_not_found'));
            }

            if (config.name !== existingRecord.name) {
                const existingWithNewName = await db.knex.select('id').from('providers_shared_credentials').where({ name: config.name }).first();

                if (existingWithNewName) {
                    return Err(new Error('shared_credentials_already_exists'));
                }
            }

            const configToUpdate = encryptionManager.encryptProviderConfig(configForEncryption as ProviderConfig);

            const result = await db.knex
                .from('providers_shared_credentials')
                .where({ id: parseInt(id) })
                .update({
                    name: config.name,
                    credentials: configToUpdate,
                    updated_at: new Date()
                })
                .returning('*');

            if (result.length === 0) {
                return Err(new Error('shared_credentials_provider_not_found'));
            }

            const updatedProvider: DBSharedCredentials = result[0];

            return Ok(updatedProvider.id);
        } catch (err) {
            return Err(new Error(`Failed to edit shared credentials: ${err instanceof Error ? err.message : 'Unknown error'}`));
        }
    }

    async listSharedCredentials(): Promise<Result<DBSharedCredentials[]>> {
        try {
            const result = await db.knex.select('*').from('providers_shared_credentials');

            const mappedResult = result.map((provider: DBSharedCredentials) => {
                const credentials = provider.credentials;
                let decryptedClientSecret = credentials.oauth_client_secret;

                if (credentials.oauth_client_secret_iv && credentials.oauth_client_secret_tag) {
                    decryptedClientSecret = encryptionManager.decryptSync(
                        credentials.oauth_client_secret,
                        credentials.oauth_client_secret_iv,
                        credentials.oauth_client_secret_tag
                    );
                }

                return {
                    ...provider,
                    credentials: {
                        ...credentials,
                        oauth_client_secret: decryptedClientSecret
                    }
                };
            });

            return Ok(mappedResult);
        } catch (err) {
            return Err(new Error(`Failed to get shared credentials: ${err instanceof Error ? err.message : 'Unknown error'}`));
        }
    }
}

export default new SharedCredentialsService();
