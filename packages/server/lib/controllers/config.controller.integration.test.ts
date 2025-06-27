import { beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { NangoError, seeders } from '@nangohq/shared';

import configController from './config.controller.js';

import type { RequestLocals } from '../utils/express.js';
import type { ConnectSession, DBEnvironment, DBTeam, DBUser, EndUser } from '@nangohq/types';
import type { NextFunction, Request } from 'express';

const locals: Required<RequestLocals> = {
    authType: 'secretKey',
    account: { id: 0 } as DBTeam,
    environment: { id: 1 } as DBEnvironment,
    user: { id: 0 } as DBUser,
    connectSession: { id: 0 } as ConnectSession,
    endUser: { id: 0 } as EndUser,
    plan: seeders.getTestPlan(),
    lang: 'en'
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
});
