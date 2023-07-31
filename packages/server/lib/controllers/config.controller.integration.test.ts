import { expect, describe, it, beforeAll, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { db, NangoError, configService, Config as ProviderConfig } from '@nangohq/shared';
import configController from './config.controller';

describe('Should verify the config controller HTTP API calls', async () => {
    beforeAll(async () => {
        await db.knex.raw(`CREATE SCHEMA IF NOT EXISTS ${db.schema()}`);
        await db.migrate(String(process.env['NANGO_DB_MIGRATION_FOLDER']));

        console.log('Database is migrated and ready');
    });

    it('Create provider config handles various missing attributes', async () => {
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
        } as unknown as Response;

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
        // @ts-ignore
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

    it('Create a provider config successfully', async () => {
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
    });

    it('Delete a provider config successfully', async () => {
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

    it('Creates a few more provider configs and they are listed', async () => {
        const result = await db.knex.withSchema(db.schema()).select('*').from('_nango_environments');
        await configService.createProviderConfig({
            unique_key: 'test1',
            provider: 'google',
            environment_id: result[0].id
        } as ProviderConfig);
        await configService.createProviderConfig({
            unique_key: 'test2',
            provider: 'google',
            environment_id: result[0].id
        } as ProviderConfig);
        await configService.createProviderConfig({
            unique_key: 'test3',
            provider: 'google',
            environment_id: result[0].id
        } as ProviderConfig);

        const sendMock = vi.fn();
        const res = {
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
        const next = () => {
            return;
        };

        await configController.listProviderConfigs({} as Request, res as unknown as Response, next as NextFunction);
        expect(sendMock).toHaveBeenCalledWith({
            configs: [
                { unique_key: 'test1', provider: 'google' },
                { unique_key: 'test2', provider: 'google' },
                { unique_key: 'test3', provider: 'google' }
            ]
        });
    });
});
