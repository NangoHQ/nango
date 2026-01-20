import { describe, expect, it, vi } from 'vitest';

import { syncTagsToConnection, updateConnectionTags } from './tags.service.js';
import { getTestTeam } from '../seeders/account.seeder.js';
import { getTestConnectSession } from '../seeders/connectSession.seeder.js';
import { getTestConnection } from '../seeders/connection.seeder.js';
import { getTestEnvironment } from '../seeders/environment.seeder.js';

import type { DBConnection } from '@nangohq/types';
import type { Knex } from 'knex';

describe('tags.service', () => {
    const mockAccount = getTestTeam();
    const mockEnvironment = getTestEnvironment();
    // getTestConnection returns DBConnectionDecrypted, cast to DBConnection for unit tests
    const mockConnection = getTestConnection() as unknown as DBConnection;

    describe('updateConnectionTags', () => {
        it('should call db update with correct parameters', async () => {
            const mockUpdate = vi.fn().mockResolvedValue(1);
            const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
            const mockDb = vi.fn().mockReturnValue({ where: mockWhere }) as unknown as Knex;

            const tags = { projectId: '123', orgId: '456' };
            await updateConnectionTags(mockDb, {
                connection: mockConnection,
                account: mockAccount,
                environment: mockEnvironment,
                tags
            });

            expect(mockDb).toHaveBeenCalledWith('_nango_connections');
            expect(mockWhere).toHaveBeenCalledWith({ id: mockConnection.id });
            expect(mockUpdate).toHaveBeenCalledWith({ tags });
        });
    });

    describe('syncTagsToConnection', () => {
        it('should return Ok(false) when session has no tags', async () => {
            const mockDb = vi.fn() as unknown as Knex;
            const sessionWithoutTags = getTestConnectSession({ tags: null });

            const result = await syncTagsToConnection(mockDb, {
                connectSession: sessionWithoutTags,
                connection: mockConnection,
                account: mockAccount,
                environment: mockEnvironment
            });

            expect(result.isOk()).toBe(true);
            expect(result.unwrap()).toBe(false);
            // DB should not have been called
            expect(mockDb).not.toHaveBeenCalled();
        });

        it('should update connection tags when session has tags', async () => {
            const tags = { projectId: '123' };
            const mockUpdate = vi.fn().mockResolvedValue(1);
            const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
            const mockDb = vi.fn().mockReturnValue({ where: mockWhere }) as unknown as Knex;

            const sessionWithTags = getTestConnectSession({ tags });
            const connectionToUpdate = getTestConnection() as unknown as DBConnection;

            const result = await syncTagsToConnection(mockDb, {
                connectSession: sessionWithTags,
                connection: connectionToUpdate,
                account: mockAccount,
                environment: mockEnvironment
            });

            expect(result.isOk()).toBe(true);
            expect(result.unwrap()).toBe(true);
            expect(mockUpdate).toHaveBeenCalledWith({ tags });
        });

        it('should mutate connection.tags after sync', async () => {
            const tags = { env: 'production' };
            const mockUpdate = vi.fn().mockResolvedValue(1);
            const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
            const mockDb = vi.fn().mockReturnValue({ where: mockWhere }) as unknown as Knex;

            const sessionWithTags = getTestConnectSession({ tags });
            const connectionToUpdate = getTestConnection({ tags: null }) as unknown as DBConnection;

            expect(connectionToUpdate.tags).toBeNull();

            await syncTagsToConnection(mockDb, {
                connectSession: sessionWithTags,
                connection: connectionToUpdate,
                account: mockAccount,
                environment: mockEnvironment
            });

            expect(connectionToUpdate.tags).toStrictEqual(tags);
        });
    });
});
