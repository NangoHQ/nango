import { expect, describe, it, beforeAll } from 'vitest';
import db, { multipleMigrations } from '@nangohq/database';
import connectionService from './connection.service.js';
import type { Connection } from '../models/Connection.js';
import type { DBEnvironment, Metadata } from '@nangohq/types';
import { createConfigSeeds } from '../seeders/config.seeder.js';
import { createConnectionSeeds } from '../seeders/connection.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';

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
});
