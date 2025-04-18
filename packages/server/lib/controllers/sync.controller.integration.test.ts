/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import syncController from './sync.controller.js';
import type { DBTeam, DBEnvironment, ConnectSession, DBUser, EndUser } from '@nangohq/types';
import type { RequestLocals } from '../utils/express.js';
import { syncManager } from '@nangohq/shared';

const mockRunSyncCommand = vi.spyOn(syncManager, 'runSyncCommand').mockResolvedValue({
    success: true,
    response: true,
    error: null
});

const createMockRequest = ({ body = {}, query = {}, params = {}, headers = {} as Record<string, any> } = {}): Request => {
    return {
        body,
        params,
        query,
        get: (header: string) => headers[header]
    } as Request;
};
const createMockResponse = (): Response<any, Required<RequestLocals>> => {
    return {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        locals: {
            authType: 'secretKey',
            account: { id: 0 } as DBTeam,
            environment: { id: 1 } as DBEnvironment,
            user: { id: 0 } as DBUser,
            connectSession: { id: 0 } as ConnectSession,
            endUser: { id: 0 } as EndUser
        }
    } as unknown as Response<any, Required<RequestLocals>>;
};

describe('pause', () => {
    let mockNext: NextFunction;

    beforeEach(() => {
        mockNext = vi.fn();
        vi.clearAllMocks();
    });

    describe('provider_config_key validation', () => {
        it('should return 400 if provider_config_key is missing', async () => {
            const req = createMockRequest();
            const res = createMockResponse();

            await syncController.pause(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'Missing provider config key'
            });
        });
    });

    describe('syncs parameter validation', () => {
        it('should return 400 if syncs is missing', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'test-key'
                }
            });
            const res = createMockResponse();

            await syncController.pause(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'Missing sync names'
            });
        });
        it('should return 400 if syncs is not an array', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'test-key',
                    syncs: 'not-an-array'
                }
            });
            const res = createMockResponse();

            await syncController.pause(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'syncs must be an array'
            });
        });

        it('should return 400 for invalid sync objects', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'test-key',
                    syncs: [{ invalid: 'object' }, 'valid-sync', null]
                }
            });
            const res = createMockResponse();

            await syncController.pause(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'syncs must be either strings or { name: string, variant: string } objects'
            });
        });

        it('should handle syncs as strings', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'test-key',
                    syncs: ['sync1', 'sync2']
                }
            });
            const res = createMockResponse();

            await syncController.pause(req, res, mockNext);

            expect(mockRunSyncCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'PAUSE',
                    syncIdentifiers: [
                        { syncName: 'sync1', syncVariant: 'base' },
                        { syncName: 'sync2', syncVariant: 'base' }
                    ]
                })
            );
        });

        it('should handle syncs as object', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'test-key',
                    syncs: [
                        { name: 'sync1', variant: 'v1' },
                        { name: 'sync2', variant: 'v2' }
                    ]
                }
            });
            const res = createMockResponse();

            await syncController.pause(req, res, mockNext);

            expect(mockRunSyncCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'PAUSE',
                    syncIdentifiers: [
                        { syncName: 'sync1', syncVariant: 'v1' },
                        { syncName: 'sync2', syncVariant: 'v2' }
                    ]
                })
            );
        });
    });
});

describe('start', () => {
    let mockNext: NextFunction;

    beforeEach(() => {
        mockNext = vi.fn();
        vi.clearAllMocks();
    });

    describe('provider_config_key validation', () => {
        it('should return 400 if provider_config_key is missing', async () => {
            const req = createMockRequest();
            const res = createMockResponse();

            await syncController.start(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'Missing provider config key'
            });
        });
    });

    describe('syncs parameter validation', () => {
        it('should return 400 if syncs is not an array', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'test-key',
                    syncs: 'not-an-array'
                }
            });
            const res = createMockResponse();

            await syncController.start(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'syncs must be an array'
            });
        });

        it('should return 400 if syncs is missing', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'test-key'
                }
            });
            const res = createMockResponse();

            await syncController.start(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'Missing sync names'
            });
        });

        it('should return 400 for invalid sync objects', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'test-key',
                    syncs: [{ invalid: 'object' }, 'valid-sync', null]
                }
            });
            const res = createMockResponse();

            await syncController.start(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'syncs must be either strings or { name: string, variant: string } objects'
            });
        });

        it('should handle syncs as strings', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'test-key',
                    syncs: ['sync1', 'sync2']
                }
            });
            const res = createMockResponse();

            await syncController.start(req, res, mockNext);

            expect(mockRunSyncCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'UNPAUSE',
                    syncIdentifiers: [
                        { syncName: 'sync1', syncVariant: 'base' },
                        { syncName: 'sync2', syncVariant: 'base' }
                    ]
                })
            );
        });

        it('should handle syncs as object', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'test-key',
                    syncs: [
                        { name: 'sync1', variant: 'v1' },
                        { name: 'sync2', variant: 'v2' }
                    ]
                }
            });
            const res = createMockResponse();

            await syncController.start(req, res, mockNext);

            expect(mockRunSyncCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'UNPAUSE',
                    syncIdentifiers: [
                        { syncName: 'sync1', syncVariant: 'v1' },
                        { syncName: 'sync2', syncVariant: 'v2' }
                    ]
                })
            );
        });
    });
});

describe('updateFrequencyForConnection', () => {
    let mockNext: NextFunction;

    beforeEach(() => {
        mockNext = vi.fn();
        vi.clearAllMocks();
    });

    describe('input validation', () => {
        it('should return 400 if provider_config_key is missing', async () => {
            const req = createMockRequest({
                body: {
                    connection_id: 'conn-123',
                    sync_name: 'sync1',
                    frequency: '1h'
                }
            });
            const res = createMockResponse();

            await syncController.updateFrequencyForConnection(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'provider_config_key must be a string'
            });
        });

        it('should return 400 if connection_id is missing', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'provider-123',
                    sync_name: 'sync1',
                    frequency: '1h'
                }
            });
            const res = createMockResponse();

            await syncController.updateFrequencyForConnection(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'connection_id must be a string'
            });
        });

        it('should return 400 if sync_name is missing', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'provider-123',
                    connection_id: 'conn-123',
                    frequency: '1h'
                }
            });
            const res = createMockResponse();

            await syncController.updateFrequencyForConnection(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'Missing sync name'
            });
        });

        it('should return 400 if sync_name format is invalid', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'provider-123',
                    connection_id: 'conn-123',
                    sync_name: { invalid: 'format' },
                    frequency: '1h'
                }
            });
            const res = createMockResponse();

            await syncController.updateFrequencyForConnection(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'syncs must be either strings or { name: string, variant: string } objects'
            });
        });

        it('should return 400 if frequency is invalid type', async () => {
            const req = createMockRequest({
                body: {
                    provider_config_key: 'provider-123',
                    connection_id: 'conn-123',
                    sync_name: 'sync1',
                    frequency: 123
                }
            });
            const res = createMockResponse();

            await syncController.updateFrequencyForConnection(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'frequency must be a string or null'
            });
        });
    });
});

describe('getSyncStatus', () => {
    let mockNext: NextFunction;
    const mockGetSyncStatus = vi.spyOn(syncManager, 'getSyncStatus').mockResolvedValue({
        success: true,
        response: [],
        error: null
    });

    beforeEach(() => {
        mockNext = vi.fn();
        vi.clearAllMocks();
    });

    describe('query params validation', () => {
        it('should return 400 if provider_config_key is missing', async () => {
            const req = createMockRequest({
                query: {
                    syncs: 'sync1'
                }
            });
            const res = createMockResponse();

            await syncController.getSyncStatus(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'Missing provider config key'
            });
        });

        it('should return 400 if syncs is missing', async () => {
            const req = createMockRequest({
                query: {
                    provider_config_key: 'test-key'
                }
            });
            const res = createMockResponse();

            await syncController.getSyncStatus(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.send).toHaveBeenCalledWith({
                message: 'Missing sync names'
            });
        });

        it('should handle syncs as comma-separated string', async () => {
            const req = createMockRequest({
                query: {
                    provider_config_key: 'test-key',
                    syncs: 'sync1,sync2'
                }
            });
            const res = createMockResponse();

            await syncController.getSyncStatus(req, res, mockNext);

            expect(mockGetSyncStatus).toHaveBeenCalledWith(
                expect.objectContaining({
                    syncIdentifiers: [
                        { syncName: 'sync1', syncVariant: 'base' },
                        { syncName: 'sync2', syncVariant: 'base' }
                    ]
                })
            );
        });

        it('should handle wildcard syncs parameter', async () => {
            vi.mock(import('@nangohq/shared'), async (importOriginal) => {
                const mod = await importOriginal();
                return {
                    ...mod,
                    getSyncsByProviderConfigKey: vi.fn().mockResolvedValue([
                        { name: 'sync1', variant: 'base' },
                        { name: 'sync2', variant: 'base' },
                        { name: 'sync2', variant: 'v1' }
                    ])
                };
            });

            const req = createMockRequest({
                query: {
                    provider_config_key: 'test-key',
                    syncs: '*'
                }
            });
            const res = createMockResponse();

            await syncController.getSyncStatus(req, res, mockNext);

            expect(mockGetSyncStatus).toHaveBeenCalledWith(
                expect.objectContaining({
                    syncIdentifiers: [
                        { syncName: 'sync1', syncVariant: 'base' },
                        { syncName: 'sync2', syncVariant: 'base' },
                        { syncName: 'sync2', syncVariant: 'v1' }
                    ]
                })
            );
        });

        it('should handle syncs with variants', async () => {
            const req = createMockRequest({
                query: {
                    provider_config_key: 'test-key',
                    syncs: 'sync1::v1,sync2::v2'
                }
            });
            const res = createMockResponse();

            await syncController.getSyncStatus(req, res, mockNext);

            expect(mockGetSyncStatus).toHaveBeenCalledWith(
                expect.objectContaining({
                    syncIdentifiers: [
                        { syncName: 'sync1', syncVariant: 'v1' },
                        { syncName: 'sync2', syncVariant: 'v2' }
                    ]
                })
            );
        });
    });
});
