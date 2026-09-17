import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productTracking } from '@nangohq/shared';

import { productTrackingMiddleware } from './productTracking.middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

type Capture = (payload: { event: string; distinctId: string; properties: Record<string, unknown> }) => void;

const capture = vi.fn<Capture>();
const realClient = productTracking.client;

/** Auth fills the locals after the middleware has run, which is what `resolve` stands in for. */
function handleRequest(resolve: (locals: Partial<RequestLocals>) => void): void {
    const res = { locals: {} } as Response<any, Partial<RequestLocals>>;
    const next: NextFunction = () => {
        resolve(res.locals);
        productTracking.track({ name: 'deploy:success' });
    };

    productTrackingMiddleware({} as Request, res, next);
}

beforeEach(() => {
    capture.mockClear();
    productTracking.client = { capture } as unknown as typeof productTracking.client;
});

afterEach(() => {
    productTracking.client = realClient;
});

describe('productTrackingMiddleware', () => {
    it('stamps the account and environment the request resolved after the middleware ran', () => {
        handleRequest((locals) => {
            locals.account = { id: 42, name: 'Acme' } as DBTeam;
            locals.environment = { id: 7, name: 'prod', is_production: true } as DBEnvironment;
            locals.plan = { name: 'growth-v2' } as DBPlan;
        });

        expect(capture.mock.calls[0]![0].properties).toMatchObject({
            'account-id': 42,
            'environment-id': 7,
            'is-prod': true,
            plan: 'growth-v2'
        });
    });

    it('keeps the account on an event from a request that resolved no environment', () => {
        handleRequest((locals) => {
            locals.account = { id: 42, name: 'Acme' } as DBTeam;
        });

        const { properties } = capture.mock.calls[0]![0];
        expect(properties['account-id']).toBe(42);
        expect(properties).not.toHaveProperty('environment-id');
        expect(properties).not.toHaveProperty('environment-name');
        expect(properties).not.toHaveProperty('is-prod');
    });

    it('drops an event from a request that resolved no account', () => {
        handleRequest(() => {
            // an unauthenticated request never resolves one
        });

        expect(capture).not.toHaveBeenCalled();
    });
});
