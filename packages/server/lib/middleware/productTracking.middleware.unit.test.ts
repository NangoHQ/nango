import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productTracking } from '@nangohq/shared';

import { productTrackingMiddleware } from './productTracking.middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

type Capture = (payload: { event: string; distinctId: string; properties: Record<string, unknown>; groups?: Record<string, string> }) => void;

type GroupIdentify = (payload: { groupType: string; groupKey: string; properties: Record<string, unknown> }) => void;

const capture = vi.fn<Capture>();
const groupIdentify = vi.fn<GroupIdentify>();
const realClient = productTracking.client;

/** Auth fills the locals after the middleware has run, which is what `resolve` stands in for. */
function handleRequest(resolve: (locals: Partial<RequestLocals>) => void): void {
    const res = { locals: {} } as Response<any, Partial<RequestLocals>>;
    const next: NextFunction = () => {
        resolve(res.locals);
        productTracking.track({ name: 'agents:session_end', eventProperties: { agent_session_id: 'session-1', session_duration_ms: 1 } });
    };

    productTrackingMiddleware({} as Request, res, next);
}

beforeEach(() => {
    capture.mockClear();
    groupIdentify.mockClear();
    productTracking.identifiedAccounts.clear();
    productTracking.client = { capture, groupIdentify } as unknown as typeof productTracking.client;
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
        expect(properties).toMatchObject({ is_production: true, surface: 'server' });
    });

    it('keeps the account on an event from a request that resolved no environment', () => {
        handleRequest((locals) => {
            locals.account = { id: 42 } as DBTeam;
        });

        const { groups, properties } = capture.mock.calls[0]![0];
        expect(groups).toStrictEqual({ company: '42' });
        expect(properties).not.toHaveProperty('is_production');
    });

    it("sets the request's plan on the account group", () => {
        handleRequest((locals) => {
            locals.account = { id: 42 } as DBTeam;
            locals.plan = { name: 'growth' } as DBPlan;
        });

        expect(groupIdentify).toHaveBeenCalledWith({ groupType: 'company', groupKey: '42', properties: { plan: 'growth' } });
    });

    it.each(['session', 'mcpOAuth'] as const)('sends an event from a %s request as its user', (authType) => {
        handleRequest((locals) => {
            locals.authType = authType;
            locals.account = { id: 42 } as DBTeam;
            locals.user = { id: 3 } as DBUser;
        });

        const { distinctId, groups } = capture.mock.calls[0]![0];
        expect(distinctId).toBe('3');
        expect(groups).toStrictEqual({ company: '42' });
    });

    it('sends an event from a secret-key request as the account', () => {
        handleRequest((locals) => {
            locals.authType = 'secretKey';
            locals.account = { id: 42 } as DBTeam;
        });

        expect(capture.mock.calls[0]![0].distinctId).toBe('account-42');
    });

    it('sends nothing from an impersonated session', () => {
        const res = { locals: {} } as Response<any, Partial<RequestLocals>>;
        productTrackingMiddleware({ session: { debugMode: true } } as unknown as Request, res, () => {
            res.locals.authType = 'session';
            res.locals.account = { id: 42 } as DBTeam;
            res.locals.user = { id: 3 } as DBUser;
            productTracking.track({ name: 'billing:plan_submit' });
        });

        expect(capture).not.toHaveBeenCalled();
    });

    it('drops an event from a request that resolved no account', () => {
        handleRequest(() => {
            // an unauthenticated request never resolves one
        });

        expect(capture).not.toHaveBeenCalled();
    });
});
