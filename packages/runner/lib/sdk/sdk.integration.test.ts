import { expect, describe, it, beforeAll } from 'vitest';
import { multipleMigrations } from '@nangohq/database';
import type { Connection } from '@nangohq/shared';
import { connectionService, environmentService, seeders } from '@nangohq/shared';
import type { DBEnvironment, DBSyncConfig, NangoProps } from '@nangohq/types';
import { NangoActionRunner } from './sdk.js';

describe('Connection service integration tests', () => {
    let env: DBEnvironment;
    beforeAll(async () => {
        await multipleMigrations();
        env = await seeders.createEnvironmentSeed();
        await seeders.createConfigSeeds(env);
    });

    describe('Nango object tests', () => {
        it('Should retrieve connections correctly if different connection credentials are passed in', async () => {
            const connections = await seeders.createConnectionSeeds(env);

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
                team: {
                    id: environment.account_id,
                    name: 'team'
                },
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
                syncConfig: {} as DBSyncConfig,
                debug: false,
                runnerFlags: {} as any,
                startedAt: new Date(),
                endUser: null
            };

            const nango = new NangoActionRunner(nangoProps);

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
