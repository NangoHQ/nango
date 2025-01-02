import { expect, describe, it, beforeAll } from 'vitest';
import db, { multipleMigrations } from '@nangohq/database';
import connectionService from './connection.service.js';
import type { Connection } from '../models/Connection.js';
import type { Metadata } from '@nangohq/types';
import { createConfigSeed, createConfigSeeds } from '../seeders/config.seeder.js';
import { createConnectionSeeds, createConnectionSeed } from '../seeders/connection.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';
import { errorNotificationService } from './notification/error.service.js';
import { createSyncSeeds } from '../seeders/sync.seeder.js';

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

            const google = await createConnectionSeed({ env, provider: 'google' });
            const notion = await createConnectionSeed({ env, provider: 'notion' });

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

            const google = await createConnectionSeed({ env, provider: 'google' });
            const notion = await createConnectionSeed({ env, provider: 'notion' });
            await createConnectionSeed({ env, provider: 'notion' });
            await createConnectionSeed({ env, provider: 'notion' });

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
            const google = await createConnectionSeed({ env, provider: 'google' });
            await createConnectionSeed({ env, provider: 'notion' });

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

            const notion = await createConnectionSeed({ env, provider: 'notion' });
            await createConnectionSeed({ env, provider: 'notion' });

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

            const notion = await createConnectionSeed({ env, provider: 'notion' });
            await createConnectionSeed({ env, provider: 'notion' });

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

            const notionError = await createConnectionSeed({ env, provider: 'notion' });
            await errorNotificationService.auth.create({
                type: 'auth',
                action: 'connection_test',
                connection_id: notionError.id!,
                log_id: Math.random().toString(36).substring(7),
                active: true
            });
            await createConnectionSeed({ env, provider: 'notion' });

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

            const notionError = await createConnectionSeed({ env, provider: 'notion' });
            await errorNotificationService.auth.create({
                type: 'auth',
                action: 'connection_test',
                connection_id: notionError.id!,
                log_id: Math.random().toString(36).substring(7),
                active: true
            });
            const notionOK = await createConnectionSeed({ env, provider: 'notion' });

            const dbConnections = await connectionService.listConnections({
                environmentId: env.id,
                withError: false
            });

            const connectionIds = dbConnections.map((c) => c.connection.connection_id);
            expect(connectionIds).toEqual([notionOK.connection_id]);
        });
    });

    describe('count', () => {
        it('return total and error counts', async () => {
            const env = await createEnvironmentSeed();

            const config = await createConfigSeed(env, 'notion', 'notion');

            await createConnectionSeed({ env, provider: 'notion' });

            const notionAuthError = await createConnectionSeed({ env, provider: 'notion' });
            await errorNotificationService.auth.create({
                type: 'auth',
                action: 'connection_test',
                connection_id: notionAuthError.id!,
                log_id: Math.random().toString(36).substring(7),
                active: true
            });

            const notionSyncError = await createConnectionSeed({ env, provider: 'notion' });
            const sync = await createSyncSeeds({
                connectionId: notionSyncError.id!,
                environment_id: env.id,
                nango_config_id: config.id!,
                sync_name: 'test'
            });
            await errorNotificationService.sync.create({
                type: 'sync',
                action: 'sync_test',
                connection_id: notionSyncError.id!,
                log_id: Math.random().toString(36).substring(7),
                active: true,
                sync_id: sync.sync.id
            });

            const countResult = await connectionService.count({ environmentId: env.id });
            const count = countResult.unwrap();

            expect(count.total).toBe(3);
            expect(count.withAuthError).toBe(1);
            expect(count.withSyncError).toBe(1);
            expect(count.withError).toBe(2);
        });
    });
});
