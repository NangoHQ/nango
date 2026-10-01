import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accountGroupProperties, isInternalAccount, productTracking, withProductTrackingContext } from './productTracking.js';

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
    productTracking.identifiedAccounts.clear();
    productTracking.client = { capture, groupIdentify } as unknown as typeof productTracking.client;
});

afterEach(() => {
    productTracking.client = realClient;
});

describe('track', () => {
    it('attaches the event to the account group and says where it was sent from', () => {
        productTracking.track({ name: 'billing:plan_submit', team, environment, eventProperties: { source: 'repo' } });

        expect(capture).toHaveBeenCalledWith({
            event: 'billing:plan_submit',
            distinctId: 'account-42',
            groups: { company: '42' },
            properties: expect.objectContaining({
                source: 'repo',
                surface: 'server',
                is_production: true
            })
        });
    });

    it('sends an event nobody is behind as the account, with person processing on so it links to the group', () => {
        productTracking.track({ name: 'billing:plan_submit', team });

        const { distinctId, properties } = lastCapture();
        expect(distinctId).toBe('account-42');
        expect(properties).not.toHaveProperty('$process_person_profile');
    });

    it('identifies a person by their user id, and then keeps the profile', () => {
        productTracking.track({ name: 'billing:plan_submit', team, user });

        const { distinctId, properties } = lastCapture();
        expect(distinctId).toBe('3');
        expect(properties).not.toHaveProperty('$process_person_profile');
    });

    it('omits is_production when there is no environment to resolve', () => {
        productTracking.track({ name: 'billing:plan_submit', team });

        expect(lastCapture().properties).not.toHaveProperty('is_production');
    });

    it('sends no personal data on the event', () => {
        productTracking.track({ name: 'billing:plan_submit', team: { id: 43, name: 'Acme' }, environment, user });

        const properties = lastCapture().properties;
        for (const forbidden of ['$set', 'email', 'name', 'team-name', 'team_name', 'account_name']) {
            expect(properties).not.toHaveProperty(forbidden);
        }
    });

    it('drops an event that has no account anywhere', () => {
        productTracking.track({ name: 'billing:plan_submit' });

        expect(capture).not.toHaveBeenCalled();
    });

    it('names the account group once, and again only when the name changes', () => {
        productTracking.track({ name: 'billing:plan_submit', team: { id: 44, name: 'Acme' } });
        productTracking.track({ name: 'billing:plan_submit', team: { id: 44, name: 'Acme' } });
        productTracking.track({ name: 'billing:plan_submit', team: { id: 44, name: 'Acme Inc' } });

        expect(groupIdentify.mock.calls.map(([payload]) => payload)).toStrictEqual([
            { groupType: 'company', groupKey: '44', properties: { name: 'Acme' } },
            { groupType: 'company', groupKey: '44', properties: { name: 'Acme Inc' } }
        ]);
    });

    it('still sends the event when naming the account group fails', () => {
        groupIdentify.mockImplementationOnce(() => {
            throw new Error('boom');
        });

        productTracking.track({ name: 'billing:plan_submit', team: { id: 45, name: 'Acme' } });

        expect(capture).toHaveBeenCalledTimes(1);
    });

    it('leaves the account group alone when nothing about it is known', () => {
        productTracking.track({ name: 'billing:plan_submit', team });

        expect(groupIdentify).not.toHaveBeenCalled();
    });

    it('sets the plan and created date on the account group', () => {
        const createdAt = new Date('2024-03-01T10:00:00.000Z');
        productTracking.track({ name: 'billing:plan_submit', team: { id: 46, name: 'Acme', created_at: createdAt }, plan: { name: 'growth' } });

        expect(groupIdentify).toHaveBeenCalledWith({
            groupType: 'company',
            groupKey: '46',
            properties: { name: 'Acme', plan: 'growth', created_date: '2024-03-01T10:00:00.000Z' }
        });
    });

    it('sends only the group properties that changed', () => {
        productTracking.track({ name: 'billing:plan_submit', team: { id: 47, name: 'Acme' }, plan: { name: 'free' } });
        productTracking.track({ name: 'billing:plan_submit', team: { id: 47 }, plan: { name: 'free' } });
        productTracking.track({ name: 'billing:plan_submit', team: { id: 47, name: 'Acme' }, plan: { name: 'growth' } });

        expect(groupIdentify.mock.calls.map(([payload]) => payload.properties)).toStrictEqual([{ name: 'Acme', plan: 'free' }, { plan: 'growth' }]);
    });
});

describe('plan: null', () => {
    it("keeps the request's plan off the account group", () => {
        withProductTrackingContext(
            () => ({ team: { id: 48 }, plan: { name: 'free' } }),
            () => {
                productTracking.track({ name: 'billing:plan_update', plan: { name: 'growth' } });
                productTracking.track({ name: 'billing:plan_submit', plan: null });
            }
        );

        expect(groupIdentify.mock.calls.map(([payload]) => payload.properties)).toStrictEqual([{ plan: 'growth' }]);
    });
});

describe('accountGroupProperties', () => {
    it('leaves out what it does not know', () => {
        expect(accountGroupProperties({ id: 1 }, null)).toStrictEqual({});
    });
});

describe('isInternalAccount', () => {
    it('is internal only when every user has a @nango.dev email', () => {
        expect(isInternalAccount([{ email: 'a@nango.dev' }, { email: 'B@Nango.dev' }])).toBe(true);
        expect(isInternalAccount([{ email: 'a@nango.dev' }, { email: 'kelvin@customer.com' }])).toBe(false);
        expect(isInternalAccount([{ email: 'a@nango.dev.example.com' }])).toBe(false);
        expect(isInternalAccount([])).toBe(false);
    });
});

describe('identifyAccountGroup', () => {
    it('sends a property the request context does not carry, once per change, and keeps it out of later diffs', () => {
        productTracking.identifyAccountGroup(48, { is_internal: true });
        productTracking.identifyAccountGroup(48, { is_internal: true });
        productTracking.track({ name: 'account:billing:downgraded', team: { id: 48, name: 'Acme' } });

        expect(groupIdentify.mock.calls.map(([payload]) => payload)).toStrictEqual([
            { groupType: 'company', groupKey: '48', properties: { is_internal: true } },
            { groupType: 'company', groupKey: '48', properties: { name: 'Acme' } }
        ]);
    });
});

describe('withProductTrackingContext', () => {
    it('stamps the context on an event that passes nothing', () => {
        withProductTrackingContext(
            () => ({ team, environment }),
            () => {
                productTracking.track({ name: 'billing:plan_submit' });
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
                productTracking.track({ name: 'billing:plan_submit' });
            }
        );

        expect(lastCapture().properties['is_production']).toBe(true);
    });

    it('lets the event override the context', () => {
        const dev = { is_production: false } as DBEnvironment;

        withProductTrackingContext(
            () => ({ team, environment }),
            () => {
                productTracking.track({ name: 'billing:plan_submit', environment: dev });
            }
        );

        expect(lastCapture().properties['is_production']).toBe(false);
    });

    it('sends nothing while a Nango admin is impersonating the account, even for an event that names it', () => {
        withProductTrackingContext(
            () => ({ team, environment, impersonated: true }),
            () => {
                productTracking.track({ name: 'account:billing:downgraded', team: { id: 47, name: 'Acme' } });
                expect(productTracking.getServerEventAttribution({ team })).toBeNull();
            }
        );

        expect(capture).not.toHaveBeenCalled();
        expect(groupIdentify).not.toHaveBeenCalled();
    });

    it('leaves an anonymous CLI event on its own surface, with no account', () => {
        withProductTrackingContext(
            () => ({ team, environment }),
            () => {
                productTracking.trackAnonymous({ name: 'functions:command_start', distinctId: 'device-1' });
            }
        );

        const { distinctId, groups, properties } = lastCapture();
        expect(distinctId).toBe('device-1');
        expect(groups).toBeUndefined();
        expect(properties).toMatchObject({ surface: 'cli', $process_person_profile: false });
        expect(properties).not.toHaveProperty('is_production');
    });
});
