import { afterEach, describe, expect, it, vi } from 'vitest';

import { productTracking } from '@nangohq/shared';

import { productTrackingMiddleware } from './productTracking.middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

type Capture = (payload: { event: string; distinctId: string; properties: Record<string, unknown> }) => void;

const realClient = productTracking.client;

afterEach(() => {
    productTracking.client = realClient;
});

describe('productTrackingMiddleware', () => {
    it('stamps the account and environment the request resolved after the middleware ran', () => {
        const capture = vi.fn<Capture>();
        productTracking.client = { capture } as unknown as typeof productTracking.client;

        const res = { locals: {} } as Response<any, Partial<RequestLocals>>;
        const next: NextFunction = () => {
            res.locals['account'] = { id: 42, name: 'Acme' } as DBTeam;
            res.locals['environment'] = { id: 7, name: 'prod', is_production: true } as DBEnvironment;
            res.locals['plan'] = { name: 'growth-v2' } as DBPlan;

            productTracking.track({ name: 'deploy:success' });
        };

        productTrackingMiddleware({} as Request, res, next);

        expect(capture.mock.calls[0]![0].properties).toMatchObject({
            'account-id': 42,
            'environment-id': 7,
            'is-prod': true,
            plan: 'growth-v2'
        });
    });
});
