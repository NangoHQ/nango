import { describe, expect, it, vi } from 'vitest';

import { syncTagsToConnection, updateConnectionTags } from './tags.service.js';
import { getTestConnectSession } from '../seeders/connectSession.seeder.js';
import { getTestConnection } from '../seeders/connection.seeder.js';

import type { DBConnection } from '@nangohq/types';
import type { Knex } from 'knex';

describe('tags.service', () => {
    // getTestConnection returns DBConnectionDecrypted, cast to DBConnection for unit tests
    const mockConnection = getTestConnection() as unknown as DBConnection;

    describe('updateConnectionTags', () => {
        it('should call db update with correct parameters and normalize tags', async () => {
            const mockUpdate = vi.fn().mockResolvedValue(1);
            const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
            const mockDb = vi.fn().mockReturnValue({ where: mockWhere }) as unknown as Knex;

            const tags = { projectId: '123', orgId: '456' };
            const result = await updateConnectionTags(mockDb, {
                connection: mockConnection,
                tags
            });

            expect(mockDb).toHaveBeenCalledWith('_nango_connections');
            expect(mockWhere).toHaveBeenCalledWith({ id: mockConnection.id });
            expect(mockUpdate).toHaveBeenCalledWith({ tags: { projectid: '123', orgid: '456' } });
            expect(result.isOk()).toBe(true);
            expect(result.unwrap()).toBe(mockConnection);
            expect(mockConnection.tags).toEqual({ projectid: '123', orgid: '456' });
        });

        it('should normalize uppercase keys and values to lowercase', async () => {
            const mockUpdate = vi.fn().mockResolvedValue(1);
            const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
            const mockDb = vi.fn().mockReturnValue({ where: mockWhere }) as unknown as Knex;

            const connectionToUpdate = getTestConnection() as unknown as DBConnection;
            const tags = { ProjectID: 'ABC123', OrgName: 'TestOrg' };
            await updateConnectionTags(mockDb, {
                connection: connectionToUpdate,
                tags
            });

            expect(mockUpdate).toHaveBeenCalledWith({ tags: { projectid: 'abc123', orgname: 'testorg' } });
            expect(connectionToUpdate.tags).toEqual({ projectid: 'abc123', orgname: 'testorg' });
        });

        it('should return the updated connection', async () => {
            const mockUpdate = vi.fn().mockResolvedValue(1);
            const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
            const mockDb = vi.fn().mockReturnValue({ where: mockWhere }) as unknown as Knex;

            const connectionToUpdate = getTestConnection({ tags: {} }) as unknown as DBConnection;
            const tags = { env: 'prod' };

            const result = await updateConnectionTags(mockDb, {
                connection: connectionToUpdate,
                tags
            });

            expect(result.isOk()).toBe(true);
            const updatedConnection = result.unwrap();
            expect(updatedConnection).toBe(connectionToUpdate);
            expect(updatedConnection.tags).toEqual({ env: 'prod' });
        });
    });

    describe('syncTagsToConnection', () => {
        it('should return Ok() when session has empty tags', async () => {
            const mockDb = vi.fn() as unknown as Knex;
            const sessionWithoutTags = getTestConnectSession({ tags: {} });

            const result = await syncTagsToConnection(mockDb, {
                connectSession: sessionWithoutTags,
                connection: mockConnection
            });

            expect(result.isOk()).toBe(true);
            expect(result.unwrap()).toBeNull();
            expect(mockDb).not.toHaveBeenCalled();
        });

        it('should update connection tags when session has tags', async () => {
            const tags = { projectid: '123' };
            const mockUpdate = vi.fn().mockResolvedValue(1);
            const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
            const mockDb = vi.fn().mockReturnValue({ where: mockWhere }) as unknown as Knex;

            const sessionWithTags = getTestConnectSession({ tags });
            const connectionToUpdate = getTestConnection() as unknown as DBConnection;

            const result = await syncTagsToConnection(mockDb, {
                connectSession: sessionWithTags,
                connection: connectionToUpdate
            });

            expect(result.isOk()).toBe(true);
            expect(result.unwrap()).toBe(connectionToUpdate);
            expect(mockUpdate).toHaveBeenCalledWith({ tags });
        });

        it('should mutate connection.tags after sync with normalized tags', async () => {
            const tags = { env: 'production' };
            const mockUpdate = vi.fn().mockResolvedValue(1);
            const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
            const mockDb = vi.fn().mockReturnValue({ where: mockWhere }) as unknown as Knex;

            const sessionWithTags = getTestConnectSession({ tags });
            const connectionToUpdate = getTestConnection({ tags: {} }) as unknown as DBConnection;

            expect(connectionToUpdate.tags).toEqual({});

            await syncTagsToConnection(mockDb, {
                connectSession: sessionWithTags,
                connection: connectionToUpdate
            });

            expect(connectionToUpdate.tags).toStrictEqual(tags);
        });
    });
});
