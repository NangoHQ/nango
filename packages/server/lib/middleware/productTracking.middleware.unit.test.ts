import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productTracking } from '@nangohq/shared';

import { productTrackingMiddleware } from './productTracking.middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { DBEnvironment, DBTeam } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

type Capture = (payload: { event: string; distinctId: string; properties: Record<string, unknown>; groups?: Record<string, string> }) => void;

const capture = vi.fn<Capture>();
const realClient = productTracking.client;

/** Auth fills the locals after the middleware has run, which is what `resolve` stands in for. */
function handleRequest(resolve: (locals: Partial<RequestLocals>) => void): void {
    const res = { locals: {} } as Response<any, Partial<RequestLocals>>;
    const next: NextFunction = () => {
        resolve(res.locals);
        productTracking.track({ name: 'account:billing:downgraded' });
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
            locals.account = { id: 42 } as DBTeam;
            locals.environment = { is_production: true } as DBEnvironment;
        });

        const { groups, properties } = capture.mock.calls[0]![0];
        expect(groups).toStrictEqual({ company: '42' });
        expect(properties).toMatchObject({ is_prod: true, surface: 'server' });
    });

    it('keeps the account on an event from a request that resolved no environment', () => {
        handleRequest((locals) => {
            locals.account = { id: 42 } as DBTeam;
        });

        const { groups, properties } = capture.mock.calls[0]![0];
        expect(groups).toStrictEqual({ company: '42' });
        expect(properties).not.toHaveProperty('is_prod');
    });

    it('drops an event from a request that resolved no account', () => {
        handleRequest(() => {
            // an unauthenticated request never resolves one
        });

        expect(capture).not.toHaveBeenCalled();
    });
});
