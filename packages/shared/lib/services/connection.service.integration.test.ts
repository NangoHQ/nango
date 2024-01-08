import { expect, describe, it, beforeAll } from 'vitest';
import { multipleMigrations } from '../db/database.js';
import connectionService from './connection.service.js';
import type { Connection, Metadata } from '../models/Connection.js';
import { createConfigSeeds } from '../db/seeders/config.seeder.js';
import { createConnectionSeeds } from '../db/seeders/connection.seeder.js';

describe('Connection service integration tests', () => {
    beforeAll(async () => {
        await multipleMigrations();
        await createConfigSeeds();
    });

    describe('Metadata simple operations', () => {
        it('Should replace existing metadata, overwriting anything existing', async () => {
            const connections = await createConnectionSeeds();

            const initialMetadata = {
                name: 'test',
                host: 'test'
            };

            const newMetadata = {
                additionalName: 'test23'
            };

            const [connectionId] = connections;
            const connection = { id: connectionId } as Connection;
            await connectionService.replaceMetadata(connection, initialMetadata);
            await connectionService.replaceMetadata(connection, newMetadata);

            const dbConnection = await connectionService.getConnectionById(connectionId as number);
            const updatedMetadata = dbConnection?.metadata as Metadata;
            expect(updatedMetadata).toEqual(newMetadata);
        });

        it('Should update metadata and not overwrite', async () => {
            const connections = await createConnectionSeeds();

            const initialMetadata = {
                name: 'test',
                host: 'test'
            };

            const newMetadata = {
                additionalName: 'test23'
            };

            const connectionId = connections[1];
            const dbConnection = (await connectionService.getConnectionById(connectionId as number)) as Connection;
            await connectionService.replaceMetadata(dbConnection, initialMetadata);
            await connectionService.updateMetadata(dbConnection, newMetadata);

            const updatedDbConnection = await connectionService.getConnectionById(connectionId as number);
            const updatedMetadata = updatedDbConnection?.metadata as Metadata;
            expect(updatedMetadata).toEqual({ ...initialMetadata, ...newMetadata });
        });
    });
});
