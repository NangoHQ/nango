import { expect, describe, it, beforeAll } from 'vitest';
import db, { multipleMigrations } from '@nangohq/database';
import connectionService from './connection.service.js';
import type { Connection } from '../models/Connection.js';
import type { Metadata } from '@nangohq/types';
import { createConfigSeed, createConfigSeeds } from '../seeders/config.seeder.js';
import { createConnectionSeeds, createConnectionSeed } from '../seeders/connection.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';
import { errorNotificationService } from './notification/error.service.js';

describe('Connection service integration tests', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    describe('Metadata simple operations', () => {
        it('Should replace existing metadata, overwriting anything existing', async () => {
            const env = await createEnvironmentSeed();
            await createConfigSeeds(env);

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
            const env = await createEnvironmentSeed();
            await createConfigSeeds(env);

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

    describe('listConnections', () => {
        it('should return all connections', async () => {
            const env = await createEnvironmentSeed();

            await createConfigSeed(env, 'google', 'google');
            await createConfigSeed(env, 'notion', 'notion');

            const google = await createConnectionSeed(env, 'google');
            const notion = await createConnectionSeed(env, 'notion');

            const dbConnections = await connectionService.listConnections({
                environmentId: env.id
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notion.connection_id, google.connection_id]);
        });

        it('should paginate', async () => {
            const env = await createEnvironmentSeed();

            await createConfigSeed(env, 'google', 'google');
            await createConfigSeed(env, 'notion', 'notion');

            const google = await createConnectionSeed(env, 'google');
            const notion = await createConnectionSeed(env, 'notion');
            await createConnectionSeed(env, 'notion');
            await createConnectionSeed(env, 'notion');

            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                limit: 2,
                page: 1
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notion.connection_id, google.connection_id]);
        });

        it('should filter connections by integration id', async () => {
            const env = await createEnvironmentSeed();

            await createConfigSeed(env, 'google', 'google');
            await createConfigSeed(env, 'notion', 'notion');
            const google = await createConnectionSeed(env, 'google');
            await createConnectionSeed(env, 'notion');

            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                integrationIds: ['google']
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([google.connection_id]);
        });

        it('should filter connections by connection id', async () => {
            const env = await createEnvironmentSeed();

            await createConfigSeed(env, 'notion', 'notion');

            const notion = await createConnectionSeed(env, 'notion');
            await createConnectionSeed(env, 'notion');

            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                connectionId: notion.connection_id
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notion.connection_id]);
        });

        it('should filter connections by search', async () => {
            const env = await createEnvironmentSeed();

            await createConfigSeed(env, 'notion', 'notion');

            const notion = await createConnectionSeed(env, 'notion');
            await createConnectionSeed(env, 'notion');

            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                search: notion.connection_id
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notion.connection_id]);
        });

        it('should return connections with errors', async () => {
            const env = await createEnvironmentSeed();

            await createConfigSeed(env, 'notion', 'notion');

            const notionError = await createConnectionSeed(env, 'notion');
            await errorNotificationService.auth.create({
                type: 'auth',
                action: 'connection_test',
                connection_id: notionError.id!,
                log_id: Math.random().toString(36).substring(7),
                active: true
            });
            await createConnectionSeed(env, 'notion');

            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                withError: true
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notionError.connection_id]);
        });

        it('should return connections without errors', async () => {
            const env = await createEnvironmentSeed();

            await createConfigSeed(env, 'notion', 'notion');

            const notionError = await createConnectionSeed(env, 'notion');
            await errorNotificationService.auth.create({
                type: 'auth',
                action: 'connection_test',
                connection_id: notionError.id!,
                log_id: Math.random().toString(36).substring(7),
                active: true
            });
            const notionOK = await createConnectionSeed(env, 'notion');

            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                withError: false
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notionOK.connection_id]);
        });
    });
});
