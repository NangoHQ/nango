import { expect, describe, it, beforeAll } from 'vitest';
import db, { multipleMigrations } from '@nangohq/database';
import connectionService from './connection.service.js';
import type { Connection } from '../models/Connection.js';
import type { DBEnvironment, Metadata, NangoConnection } from '@nangohq/types';
import { createConfigSeed, createConfigSeeds } from '../seeders/config.seeder.js';
import { createConnectionSeeds, createConnectionSeed } from '../seeders/connection.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';
import { errorNotificationService } from './notification/error.service.js';

describe('Connection service integration tests', () => {
    let env: DBEnvironment;
    beforeAll(async () => {
        await multipleMigrations();
        env = await createEnvironmentSeed();
        await createConfigSeeds(env);
    });

    describe('Metadata simple operations', () => {
        it('Should replace existing metadata, overwriting anything existing', async () => {
            const connections = await createConnectionSeeds(env);

            const initialMetadata = {
                name: 'test',
                host: 'test'
            };

            const newMetadata = {
                additionalName: 'test23'
            };

            const [connectionId] = connections;
            const connection = { id: connectionId } as Connection;
            await db.knex.transaction(async (trx) => {
                await connectionService.replaceMetadata([connection.id as number], initialMetadata, trx);
                await connectionService.replaceMetadata([connection.id as number], newMetadata, trx);
            });

            const dbConnection = await connectionService.getConnectionById(connectionId as number);
            const updatedMetadata = dbConnection?.metadata as Metadata;
            expect(updatedMetadata).toEqual(newMetadata);
        });

        it('Should update metadata and not overwrite', async () => {
            const connections = await createConnectionSeeds(env);

            const initialMetadata = {
                name: 'test',
                host: 'test'
            };

            const newMetadata = {
                additionalName: 'test23'
            };

            const connectionId = connections[1];
            const dbConnection = (await connectionService.getConnectionById(connectionId as number)) as Connection;
            await db.knex.transaction(async (trx) => {
                await connectionService.replaceMetadata([dbConnection.id as number], initialMetadata, trx);
            });

            const updatedMetadataConnection = (await connectionService.getConnectionById(connectionId as number)) as Connection;
            await connectionService.updateMetadata([updatedMetadataConnection], newMetadata);

            const updatedDbConnection = await connectionService.getConnectionById(connectionId as number);
            const updatedMetadata = updatedDbConnection?.metadata as Metadata;
            expect(updatedMetadata).toEqual({ ...initialMetadata, ...newMetadata });
        });
    });

    describe.only('listConnections', () => {
        const googleConfigKey = Math.random().toString(36).substring(7);
        const notionConfigKey = Math.random().toString(36).substring(7);

        let googleOK: NangoConnection;
        let notionOKA: NangoConnection;
        let notionOKB: NangoConnection;
        let notionError: NangoConnection;

        beforeAll(async () => {
            await createConfigSeed(env, googleConfigKey, 'google');
            await createConfigSeed(env, notionConfigKey, 'notion');

            googleOK = await createConnectionSeed(env, googleConfigKey);

            notionOKA = await createConnectionSeed(env, notionConfigKey);
            notionOKB = await createConnectionSeed(env, notionConfigKey);

            notionError = await createConnectionSeed(env, notionConfigKey);
            await errorNotificationService.auth.create({
                type: 'auth',
                action: 'connection_test',
                connection_id: notionError.id!,
                log_id: Math.random().toString(36).substring(7),
                active: true
            });
        });

        it('should return all connections', async () => {
            const dbConnections = await connectionService.listConnections({
                environmentId: env.id
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notionError.connection_id, notionOKB.connection_id, notionOKA.connection_id, googleOK.connection_id]);
        });

        it('should paginate', async () => {
            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                limit: 2,
                page: 1
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notionOKA.connection_id, googleOK.connection_id]);
        });

        it('should filter connections by integration id', async () => {
            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                integrationIds: [googleConfigKey]
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([googleOK.connection_id]);
        });

        it('should filter connections by connection id', async () => {
            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                connectionId: notionOKA.connection_id
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notionOKA.connection_id]);
        });

        it('should filter connections by search', async () => {
            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                search: notionOKB.connection_id
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notionOKB.connection_id]);
        });

        it('should return connections with errors', async () => {
            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                withError: true
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notionError.connection_id]);
        });

        it('should return connections without errors', async () => {
            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                withError: false
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notionOKB.connection_id, notionOKA.connection_id, googleOK.connection_id]);
        });
    });
});
