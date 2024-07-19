import { expect, describe, it, beforeAll } from 'vitest';
import { multipleMigrations } from '@nangohq/database';
import type { Connection } from '../models/Connection.js';
import type { NangoProps } from './sync.js';
import { NangoAction } from './sync.js';
import connectionService from '../services/connection.service.js';
import environmentService from '../services/environment.service.js';
import { createConnectionSeeds } from '../seeders/connection.seeder.js';
import { createConfigSeeds } from '../seeders/config.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';
import type { SyncConfig } from '../models/Sync.js';
import type { DBEnvironment } from '@nangohq/types';

describe('Connection service integration tests', () => {
    let env: DBEnvironment;
    beforeAll(async () => {
        await multipleMigrations();
        env = await createEnvironmentSeed();
        await createConfigSeeds(env);
    });

    describe('Nango object tests', () => {
        it('Should retrieve connections correctly if different connection credentials are passed in', async () => {
            const connections = await createConnectionSeeds(env);

            const [nangoConnectionId, secondNangoConnectionId]: number[] = connections;
            const establishedConnection = await connectionService.getConnectionById(nangoConnectionId as number);

            if (!establishedConnection) {
                throw new Error('Connection not established');
            }

            const environment = await environmentService.getById(establishedConnection.environment_id);

            if (!environment) {
                throw new Error('Environment not found');
            }

            const nangoProps: NangoProps = {
                scriptType: 'sync',
                host: 'http://localhost:3003',
                teamId: environment.account_id,
                teamName: 'team',
                connectionId: String(establishedConnection.connection_id),
                environmentId: environment.id,
                environmentName: environment.name,
                providerConfigKey: String(establishedConnection?.provider_config_key),
                provider: 'hubspot',
                activityLogId: '1',
                secretKey: '****',
                nangoConnectionId: nangoConnectionId as number,
                syncId: 'aaa-bbb-ccc',
                syncJobId: 2,
                lastSyncDate: new Date(),
                syncConfig: {} as SyncConfig,
                debug: false,
                runnerFlags: {} as any,
                startedAt: new Date()
            };

            const nango = new NangoAction(nangoProps);

            // @ts-expect-error we are overriding a private method here
            nango.nango.getConnection = async (providerConfigKey: string, connectionId: string) => {
                const { response } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);
                return response as Connection;
            };

            const connection = await nango.getConnection();
            expect(connection).toBeDefined();
            expect(connection.connection_id).toBe(establishedConnection.connection_id);
            expect(connection.provider_config_key).toBe(establishedConnection.provider_config_key);

            const secondEstablishedConnection = await connectionService.getConnectionById(secondNangoConnectionId as number);
            if (!secondEstablishedConnection) {
                throw new Error('Connection not established');
            }

            const secondConnection = await nango.getConnection(
                secondEstablishedConnection.provider_config_key,
                String(secondEstablishedConnection.connection_id)
            );
            expect(secondConnection).toBeDefined();
            expect(secondConnection.connection_id).toBe(secondEstablishedConnection.connection_id);
            expect(secondConnection.provider_config_key).toBe(secondEstablishedConnection.provider_config_key);
        });
    });
});
