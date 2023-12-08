import { expect, describe, it, vi, beforeAll } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { db, multipleMigrations, NangoError, configService } from '@nangohq/shared';
import configController from './config.controller';

/**
 * LIST: ✅
 * GET: ✅
 * CREATE: ✅
 * UPDATE: ✅
 * DELETE: ✅
 */
describe('Should verify the config controller HTTP API calls', async () => {
    beforeAll(async () => {
        await multipleMigrations();

        console.log('Database is migrated and ready');
    });

    it('CREATE provider config handles various missing attributes', async () => {
        const result = await db.knex.withSchema(db.schema()).select('*').from('_nango_environments');
        const req: any = {
            body: null,
            headers: {
                Authorization: `Bearer ${result[0].secret_key}`
            }
        };
        const sendMock = vi.fn();
        const res = {
            status: (_code: number) => {
                return {
                    send: sendMock
                };
            },
            locals: {
                nangoAccountId: 1,
                nangoEnvironmentId: 0
            }
        } as any;

        const statusSpy = vi.spyOn(res, 'status');

        const next = () => {
            return;
        };
        await configController.createProviderConfig(req as unknown as Request, res, next as NextFunction);

        expect(statusSpy).toHaveBeenCalledWith(400);
        let err = new NangoError('missing_body');
        expect(sendMock).toHaveBeenCalledWith({ error: err.message, type: err.type, payload: err.payload });

        sendMock.mockReset();

        req.body = {};
        res.status = (_code: number) => {
            return {
                send: sendMock
            };
        };
        await configController.createProviderConfig(req as unknown as Request, res, next as NextFunction);
        expect(statusSpy).toHaveBeenCalledWith(400);
        err = new NangoError('missing_provider_config');
        expect(sendMock).toHaveBeenCalledWith({ error: err.message, type: err.type, payload: err.payload });
    });

    it('CREATE a provider config successfully and then LIST', async () => {
        const result = await db.knex.withSchema(db.schema()).select('*').from('_nango_environments');
        const req: any = {
            body: {
                provider_config_key: 'test',
                provider: 'notion',
                oauth_client_id: 'abc',
                oauth_client_secret: 'def',
                oauth_scopes: 'abc,def'
            },
            headers: {
                Authorization: `Bearer ${result[0].secret_key}`
            }
        };
        const res = {
            status: (_code: number) => {
                return {
                    send: (data: any) => {
                        return data;
                    }
                };
            },
            locals: {
                nangoAccountId: 0,
                nangoEnvironmentId: 1
            }
        } as unknown as Response;
        const statusSpy = vi.spyOn(res, 'status');
        const next = () => {
            return;
        };
        await configController.createProviderConfig(req as unknown as Request, res, next as NextFunction);
        expect(statusSpy).toHaveBeenCalledWith(200);
        const config = await configService.getProviderConfig('test', 1);
        expect(config).toBeDefined();
        expect(config?.unique_key).toBe('test');
        expect(config?.oauth_scopes).toBe('abc,def');

        const sendMock = vi.fn();
        const listRes = {
            status: (code: number) => {
                expect(code).toBe(200);
                return {
                    send: sendMock
                };
            },
            locals: {
                nangoAccountId: 0,
                nangoEnvironmentId: 1
            }
        };
        const listNext = () => {
            return;
        };

        await configController.listProviderConfigs({} as Request, listRes as unknown as Response, listNext as NextFunction);

        const existingConfigs = await db.knex.withSchema(db.schema()).select('*').from('_nango_configs').where({ environment_id: 1, deleted: false });

        const configs = existingConfigs.map((config) => {
            return {
                unique_key: config.unique_key,
                provider: config.provider
            };
        });

        expect(sendMock).toHaveBeenCalledWith({ configs });
    });

    it('UPDATE and then GET a provider config successfully', async () => {
        const result = await db.knex.withSchema(db.schema()).select('*').from('_nango_environments');
        const req: any = {
            body: {
                provider_config_key: 'test',
                provider: 'notion',
                oauth_client_id: 'abc',
                oauth_client_secret: 'def',
                oauth_scopes: 'abc,def,efg',
                app_link: null,
                auth_mode: 'OAUTH2'
            },
            headers: {
                Authorization: `Bearer ${result[0].secret_key}`
            }
        };

        const res: any = {
            status: (_code: number) => {
                return {
                    send: (data: any) => {
                        return data;
                    }
                };
            },
            locals: {
                nangoAccountId: 0,
                nangoEnvironmentId: 1
            }
        };

        const statusSpy = vi.spyOn(res, 'status');

        const next = () => {
            return;
        };

        await configController.editProviderConfig(req as unknown as Request, res, next as NextFunction);
        expect(statusSpy).toHaveBeenCalledWith(200);
        const config = await configService.getProviderConfig('test', 1);
        expect(config).toBeDefined();
        expect(config?.oauth_scopes).toBe('abc,def,efg');

        // controller should also return this integration
        req.query = {};
        req.params = {
            providerConfigKey: 'test'
        };
        const sendMock = vi.fn();
        const getRes = {
            status: (code: number) => {
                expect(code).toBe(200);
                return {
                    send: sendMock
                };
            },
            locals: {
                nangoAccountId: 0,
                nangoEnvironmentId: 1
            }
        } as unknown as Response;

        await configController.getProviderConfig(req as unknown as Request, getRes, next as NextFunction);
        expect(sendMock).toHaveBeenCalledWith({
            config: {
                provider: 'notion',
                unique_key: 'test',
                syncs: [],
                actions: []
            }
        });

        sendMock.mockReset();

        req.query = {
            include_creds: 'true'
        };

        await configController.getProviderConfig(req as unknown as Request, getRes, next as NextFunction);
        expect(sendMock).toHaveBeenCalledWith({
            config: {
                provider: 'notion',
                unique_key: 'test',
                client_id: 'abc',
                client_secret: 'def',
                has_webhook: false,
                scopes: 'abc,def,efg',
                app_link: null,
                auth_mode: 'OAUTH2',
                syncs: [],
                actions: []
            }
        });
    });

    it('DELETE a provider config successfully', async () => {
        const result = await db.knex.withSchema(db.schema()).select('*').from('_nango_environments');
        const req: any = {
            params: {
                providerConfigKey: 'test'
            },
            headers: {
                Authorization: `Bearer ${result[0].secret_key}`
            }
        };
        const res = {
            status: (code: number) => {
                return code;
            },
            locals: {
                nangoAccountId: 0,
                nangoEnvironmentId: 1
            }
        } as unknown as Response;

        const statusSpy = vi.spyOn(res, 'status');

        const next = () => {
            return;
        };

        await configController.deleteProviderConfig(req as unknown as Request, res, next as NextFunction);
        const config = await configService.getProviderConfig('test', 1);
        expect(statusSpy).toHaveBeenCalledWith(204);
        expect(config).toBe(null);
    });
});
