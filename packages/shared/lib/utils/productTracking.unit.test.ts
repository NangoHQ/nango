import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productTracking, withProductTrackingContext } from './productTracking.js';

import type { DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';

const team = { id: 42, name: 'Acme' } as DBTeam;
const environment = { id: 7, name: 'prod', is_production: true } as DBEnvironment;
const plan = { name: 'growth-v2' } as DBPlan;
const user = { id: 3, email: 'john@example.com', name: 'John' } as DBUser;

type Capture = (payload: { event: string; distinctId: string; properties: Record<string, unknown> }) => void;

const capture = vi.fn<Capture>();
const realClient = productTracking.client;

function lastCapture() {
    return capture.mock.calls[0]![0];
}

beforeEach(() => {
    capture.mockClear();
    productTracking.client = { capture } as unknown as typeof productTracking.client;
});

afterEach(() => {
    productTracking.client = realClient;
});

describe('track', () => {
    it('stamps account, environment and plan on the event', () => {
        productTracking.track({ name: 'deploy:success', team, environment, plan, user, eventProperties: { source: 'repo' } });

        expect(capture).toHaveBeenCalledWith({
            event: 'deploy:success',
            distinctId: 'team-42-user-3',
            properties: expect.objectContaining({
                source: 'repo',
                'account-id': 42,
                'team-id': 42,
                'team-name': 'Acme',
                'environment-id': 7,
                'environment-name': 'prod',
                'is-prod': true,
                plan: 'growth-v2'
            })
        });
    });

    it('omits environment properties when there is no environment to resolve', () => {
        productTracking.track({ name: 'account:billing:downgraded', team });

        const { properties, distinctId } = lastCapture();
        expect(properties).not.toHaveProperty('environment-id');
        expect(properties).not.toHaveProperty('is-prod');
        expect(properties).not.toHaveProperty('plan');
        expect(properties['account-id']).toBe(42);
        expect(distinctId).toBe('team-42');
    });

    it('sets account and user properties on the person', () => {
        productTracking.track({ name: 'account:trial:started', team, environment, plan, user });

        expect(lastCapture().properties['$set']).toEqual({
            'account-id': 42,
            'team-id': 42,
            'team-name': 'Acme',
            plan: 'growth-v2',
            id: 3,
            email: 'john@example.com',
            name: 'John'
        });
    });

    it('drops an event that has no account anywhere', () => {
        productTracking.track({ name: 'deploy:success' });

        expect(capture).not.toHaveBeenCalled();
    });
});

describe('withProductTrackingContext', () => {
    it('stamps the context on an event that passes nothing', () => {
        withProductTrackingContext(
            () => ({ team, environment, plan, user }),
            () => {
                productTracking.track({ name: 'deploy:success' });
            }
        );

        const { properties, distinctId } = lastCapture();
        expect(distinctId).toBe('team-42-user-3');
        expect(properties).toMatchObject({ 'account-id': 42, 'environment-id': 7, 'is-prod': true, plan: 'growth-v2' });
    });

    it('resolves the context at emit time, not when the context is entered', () => {
        const locals: { environment?: DBEnvironment } = {};

        withProductTrackingContext(
            () => ({ team, environment: locals.environment }),
            () => {
                locals.environment = environment;
                productTracking.track({ name: 'deploy:success' });
            }
        );

        expect(lastCapture().properties['environment-id']).toBe(7);
    });

    it('lets the event override the context', () => {
        const other = { id: 9, name: 'dev', is_production: false } as DBEnvironment;

        withProductTrackingContext(
            () => ({ team, environment }),
            () => {
                productTracking.track({ name: 'deploy:success', environment: other });
            }
        );

        expect(lastCapture().properties).toMatchObject({ 'environment-id': 9, 'is-prod': false });
    });

    it('stamps the context on anonymous events too', () => {
        withProductTrackingContext(
            () => ({ team, environment }),
            () => {
                productTracking.trackAnonymous({ name: 'cli:dryrun', distinctId: 'device-1' });
            }
        );

        const { properties, distinctId } = lastCapture();
        expect(distinctId).toBe('device-1');
        expect(properties).toMatchObject({ 'device-id': 'device-1', 'account-id': 42, 'environment-id': 7 });
    });
});
