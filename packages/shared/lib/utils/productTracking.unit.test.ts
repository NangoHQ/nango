import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productTracking, withProductTrackingContext } from './productTracking.js';

import type { DBEnvironment, DBTeam, DBUser } from '@nangohq/types';

const team = { id: 42 } as DBTeam;
const environment = { is_production: true } as DBEnvironment;
const user = { id: 3 } as DBUser;

type Capture = (payload: { event: string; distinctId: string; properties: Record<string, unknown>; groups?: Record<string, string> }) => void;

type GroupIdentify = (payload: { groupType: string; groupKey: string; properties: Record<string, unknown> }) => void;

const capture = vi.fn<Capture>();
const groupIdentify = vi.fn<GroupIdentify>();
const realClient = productTracking.client;

function lastCapture() {
    return capture.mock.calls[0]![0];
}

beforeEach(() => {
    capture.mockClear();
    groupIdentify.mockClear();
    productTracking.identifiedAccountNames.clear();
    productTracking.client = { capture, groupIdentify } as unknown as typeof productTracking.client;
});

afterEach(() => {
    productTracking.client = realClient;
});

describe('track', () => {
    it('attaches the event to the account group and says where it was sent from', () => {
        productTracking.track({ name: 'account:billing:downgraded', team, environment, eventProperties: { source: 'repo' } });

        expect(capture).toHaveBeenCalledWith({
            event: 'account:billing:downgraded',
            distinctId: 'account-42',
            groups: { company: '42' },
            properties: expect.objectContaining({
                source: 'repo',
                surface: 'server',
                is_production: true
            })
        });
    });

    it('creates no person for an event nobody is behind', () => {
        productTracking.track({ name: 'account:billing:downgraded', team });

        expect(lastCapture().properties['$process_person_profile']).toBe(false);
    });

    it('identifies a person by their user id, and then keeps the profile', () => {
        productTracking.track({ name: 'account:billing:downgraded', team, user });

        const { distinctId, properties } = lastCapture();
        expect(distinctId).toBe('3');
        expect(properties).not.toHaveProperty('$process_person_profile');
    });

    it('omits is_production when there is no environment to resolve', () => {
        productTracking.track({ name: 'account:billing:downgraded', team });

        expect(lastCapture().properties).not.toHaveProperty('is_production');
    });

    it('sends no personal data on the event', () => {
        productTracking.track({ name: 'account:billing:downgraded', team: { id: 43, name: 'Acme' }, environment, user });

        const properties = lastCapture().properties;
        for (const forbidden of ['$set', 'email', 'name', 'team-name', 'team_name', 'account_name']) {
            expect(properties).not.toHaveProperty(forbidden);
        }
    });

    it('drops an event that has no account anywhere', () => {
        productTracking.track({ name: 'account:billing:downgraded' });

        expect(capture).not.toHaveBeenCalled();
    });

    it('names the account group once, and again only when the name changes', () => {
        productTracking.track({ name: 'account:billing:downgraded', team: { id: 44, name: 'Acme' } });
        productTracking.track({ name: 'account:billing:downgraded', team: { id: 44, name: 'Acme' } });
        productTracking.track({ name: 'account:billing:downgraded', team: { id: 44, name: 'Acme Inc' } });

        expect(groupIdentify.mock.calls.map(([payload]) => payload)).toStrictEqual([
            { groupType: 'company', groupKey: '44', properties: { name: 'Acme' } },
            { groupType: 'company', groupKey: '44', properties: { name: 'Acme Inc' } }
        ]);
    });

    it('still sends the event when naming the account group fails', () => {
        groupIdentify.mockImplementationOnce(() => {
            throw new Error('boom');
        });

        productTracking.track({ name: 'account:billing:downgraded', team: { id: 45, name: 'Acme' } });

        expect(capture).toHaveBeenCalledTimes(1);
    });

    it('leaves the account group alone when the name is unknown', () => {
        productTracking.track({ name: 'account:billing:downgraded', team });

        expect(groupIdentify).not.toHaveBeenCalled();
    });
});

describe('withProductTrackingContext', () => {
    it('stamps the context on an event that passes nothing', () => {
        withProductTrackingContext(
            () => ({ team, environment }),
            () => {
                productTracking.track({ name: 'account:billing:downgraded' });
            }
        );

        const { distinctId, groups, properties } = lastCapture();
        expect(distinctId).toBe('account-42');
        expect(groups).toStrictEqual({ company: '42' });
        expect(properties).toMatchObject({ is_production: true, surface: 'server' });
    });

    it('resolves the context at emit time, not when the context is entered', () => {
        const locals: { environment?: DBEnvironment } = {};

        withProductTrackingContext(
            () => ({ team, environment: locals.environment }),
            () => {
                locals.environment = environment;
                productTracking.track({ name: 'account:billing:downgraded' });
            }
        );

        expect(lastCapture().properties['is_production']).toBe(true);
    });

    it('lets the event override the context', () => {
        const dev = { is_production: false } as DBEnvironment;

        withProductTrackingContext(
            () => ({ team, environment }),
            () => {
                productTracking.track({ name: 'account:billing:downgraded', environment: dev });
            }
        );

        expect(lastCapture().properties['is_production']).toBe(false);
    });

    it('leaves an anonymous CLI event on its own surface, with no account', () => {
        withProductTrackingContext(
            () => ({ team, environment }),
            () => {
                productTracking.trackAnonymous({ name: 'cli:dryrun', distinctId: 'device-1' });
            }
        );

        const { distinctId, groups, properties } = lastCapture();
        expect(distinctId).toBe('device-1');
        expect(groups).toBeUndefined();
        expect(properties).toMatchObject({ surface: 'cli', $process_person_profile: false });
        expect(properties).not.toHaveProperty('is_production');
    });
});
