import { expect, describe, it, vi, beforeAll } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '@nangohq/shared';
import { NangoError, configService } from '@nangohq/shared';
import db, { multipleMigrations } from '@nangohq/database';
import configController from './config.controller';
import type { RequestLocals } from '../utils/express.js';
import type { DBTeam, DBEnvironment } from '@nangohq/types';

const locals: Required<RequestLocals> = {
    authType: 'secretKey',
    account: { id: 0 } as DBTeam,
    environment: { id: 1 } as DBEnvironment,
    user: { id: 0 } as User
};
/**
 * LIST: ✅
 * GET: ✅
 * CREATE: ✅
 * UPDATE: ✅
 * DELETE: ✅
 */
describe('Should verify the config controller HTTP API calls', () => {
    beforeAll(async () => {
        await multipleMigrations();

        console.log('Database is migrated and ready');
    });

    it('CREATE provider config handles various missing attributes', async () => {
        const result = await db.knex.select('*').from('_nango_environments');
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
            locals
        } as any;

        const statusSpy = vi.spyOn(res, 'status');

        const next = () => {
            return;
        };
        await configController.createProviderConfig(req as unknown as Request, res, next as NextFunction);

        expect(statusSpy).toHaveBeenCalledWith(400);
        let err = new NangoError('missing_body');
        expect(sendMock).toHaveBeenCalledWith({ error: { message: err.message, code: err.type, payload: err.payload } });

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
        expect(sendMock).toHaveBeenCalledWith({ error: { message: err.message, code: err.type, payload: err.payload } });
    });

    it('UPDATE and then GET a provider config successfully', async () => {
        const result = await db.knex.select('*').from('_nango_environments');
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

        const res = {
            status: (_code: number) => {
                return {
                    send: (data: any) => {
                        return data;
                    }
                };
            },
            locals
        };

        const statusSpy = vi.spyOn(res, 'status');

        const next = () => {
            return;
        };

        await configController.editProviderConfig(req as unknown as Request, res as unknown as Response<any, Required<RequestLocals>>, next as NextFunction);
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
            locals
        } as unknown as Response;

        await configController.getProviderConfig(req as unknown as Request, getRes as unknown as Response<any, Required<RequestLocals>>, next as NextFunction);
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

        await configController.getProviderConfig(req as unknown as Request, getRes as unknown as Response<any, Required<RequestLocals>>, next as NextFunction);
        expect(sendMock).toHaveBeenCalledWith(
            expect.objectContaining({
                config: {
                    provider: 'notion',
                    unique_key: 'test',
                    client_id: 'abc',
                    client_secret: 'def',
                    connection_count: 0,
                    connections: [],
                    custom: null,
                    docs: 'https://docs.nango.dev/integrations/all/notion',
                    has_webhook: false,
                    scopes: 'abc,def,efg',
                    app_link: null,
                    auth_mode: 'OAUTH2',
                    created_at: expect.any(Date),
                    syncs: [],
                    actions: [],
                    webhook_secret: null,
                    webhook_url: null,
                    has_webhook_user_defined_secret: undefined
                }
            })
        );
    });

    it('DELETE a provider config successfully', async () => {
        const result = await db.knex.select('*').from('_nango_environments');
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
            locals
        } as unknown as Response;

        const statusSpy = vi.spyOn(res, 'status');

        const next = () => {
            return;
        };

        await configController.deleteProviderConfig(req as unknown as Request, res as unknown as Response<any, Required<RequestLocals>>, next as NextFunction);
        const config = await configService.getProviderConfig('test', 1);
        expect(statusSpy).toHaveBeenCalledWith(204);
        expect(config).toBe(null);
    });
});
