import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as featureFlags from '@nangohq/feature-flags';
import { envs } from '@nangohq/logs';
import { Orchestrator, seeders, updatePlan, userService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { audit } from '../audit.js';
import { authenticateUser, runServer } from '../utils/tests.js';

import type { MockInstance } from 'vitest';

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

// Seeds an account/env/user plus an algolia connection and an enabled sync so `/sync/command` reaches
// the controller. The orchestrator is mocked, so the command's real business outcome is irrelevant —
// only the response status (which drives the audit outcome) and the body-derived event matter.
async function seedSync() {
    const seed = await seeders.seedAccountEnvAndUser();
    const config = await seeders.createConfigSeed(seed.env, 'algolia', 'algolia');
    const connection = await seeders.createConnectionSeed({
        env: seed.env,
        provider: 'algolia',
        rawCredentials: { type: 'API_KEY', apiKey: 'test_api_key' }
    });
    const { sync } = await seeders.createSyncSeeds({
        connectionId: connection.id,
        environment_id: seed.env.id,
        nango_config_id: config.id!,
        sync_name: 'test-sync',
        models: ['Model']
    });
    return { ...seed, config, connection, sync };
}

async function postSyncCommand(session: string, body: Record<string, unknown>): Promise<{ status: number }> {
    const res = await fetch(`${api.url}/api/v1/sync/command?env=dev`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Cookie: session },
        body: JSON.stringify(body)
    });
    return { status: res.status };
}

describe('audit sync command middleware (private API)', () => {
    beforeAll(async () => {
        api = await runServer();
        envs.NANGO_LOGS_ENABLED = false;
        auditSpy = vi.spyOn(audit, 'record');
        // getFlags() returns the stable noop facade in tests; force the audit trail on.
        vi.spyOn(featureFlags.getFlags(), 'isAuditTrailEnabled').mockResolvedValue(true);
        // The command outcome is not under test — short-circuit the real orchestration so the controller returns 200.
        vi.spyOn(Orchestrator.prototype, 'runSyncCommand').mockResolvedValue(Ok(undefined));
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        auditSpy.mockClear();
    });

    it('PAUSE records a sync paused event targeting the sync', async () => {
        const { user, connection, sync } = await seedSync();
        const session = await authenticateUser(api, user);

        const { status } = await postSyncCommand(session, {
            command: 'PAUSE',
            nango_connection_id: connection.id,
            sync_id: sync.id,
            sync_name: sync.name
        });

        expect(status).toBe(200);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'sync',
            action: 'paused',
            outcome: 'success',
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'sync', id: sync.id, display: sync.name }]
        });
    });

    it('UNPAUSE records a sync started event', async () => {
        const { user, connection, sync } = await seedSync();
        const session = await authenticateUser(api, user);

        const { status } = await postSyncCommand(session, {
            command: 'UNPAUSE',
            nango_connection_id: connection.id,
            sync_id: sync.id,
            sync_name: sync.name
        });

        expect(status).toBe(200);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'sync',
            action: 'started',
            outcome: 'success',
            targets: [{ type: 'sync', id: sync.id, display: sync.name }]
        });
    });

    it('RUN records a sync triggered event with full: false', async () => {
        const { user, connection, sync } = await seedSync();
        const session = await authenticateUser(api, user);

        const { status } = await postSyncCommand(session, {
            command: 'RUN',
            nango_connection_id: connection.id,
            sync_id: sync.id,
            sync_name: sync.name
        });

        expect(status).toBe(200);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'sync',
            action: 'triggered',
            outcome: 'success',
            targets: [{ type: 'sync', id: sync.id, display: sync.name }],
            metadata: { full: false }
        });
    });

    it('RUN_FULL records a sync triggered event with full and deleteRecords', async () => {
        const { user, connection, sync } = await seedSync();
        const session = await authenticateUser(api, user);

        const { status } = await postSyncCommand(session, {
            command: 'RUN_FULL',
            nango_connection_id: connection.id,
            sync_id: sync.id,
            sync_name: sync.name,
            delete_records: true
        });

        expect(status).toBe(200);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'sync',
            action: 'triggered',
            outcome: 'success',
            targets: [{ type: 'sync', id: sync.id, display: sync.name }],
            metadata: { full: true, deleteRecords: true }
        });
    });

    it('CANCEL records a sync cancelled event', async () => {
        const { user, connection, sync } = await seedSync();
        const session = await authenticateUser(api, user);

        const { status } = await postSyncCommand(session, {
            command: 'CANCEL',
            nango_connection_id: connection.id,
            sync_id: sync.id,
            sync_name: sync.name
        });

        expect(status).toBe(200);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'sync',
            action: 'cancelled',
            outcome: 'success',
            targets: [{ type: 'sync', id: sync.id, display: sync.name }]
        });
    });

    it('RUN with a sync_variant records triggered with the variant in metadata', async () => {
        const { user, connection, sync } = await seedSync();
        const session = await authenticateUser(api, user);

        const { status } = await postSyncCommand(session, {
            command: 'RUN',
            nango_connection_id: connection.id,
            sync_id: sync.id,
            sync_name: sync.name,
            sync_variant: 'my-variant'
        });

        expect(status).toBe(200);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'sync',
            action: 'triggered',
            outcome: 'success',
            targets: [{ type: 'sync', id: sync.id, display: sync.name }],
            metadata: { full: false, variant: 'my-variant' }
        });
    });

    it('does not record an event when the command is absent or unmapped', async () => {
        const { user, connection, sync } = await seedSync();
        const session = await authenticateUser(api, user);

        await postSyncCommand(session, {
            command: 'NOT_A_COMMAND',
            nango_connection_id: connection.id,
            sync_id: sync.id,
            sync_name: sync.name
        });

        // A known-mapped command on the same sync gives the fire-and-forget `res.on('finish')` handler
        // something to drain. Once it records exactly once — the mapped PAUSE — we know the unmapped
        // command emitted nothing, without racing the async finish handler.
        await postSyncCommand(session, {
            command: 'PAUSE',
            nango_connection_id: connection.id,
            sync_id: sync.id,
            sync_name: sync.name
        });

        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalledTimes(1);
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'sync',
            action: 'paused',
            targets: [{ type: 'sync', id: sync.id, display: sync.name }]
        });
    });

    it('records a denied event when the caller lacks the sync_command permission', async () => {
        const { env, user, plan } = await seedSync();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        // In a production environment, `development_full_access` is denied every production write — including
        // sync_command — so `can()` rejects with 403 before the controller runs.
        await db.knex.from('_nango_environments').where({ id: env.id }).update({ is_production: true });
        await userService.update({ id: user.id, role: 'development_full_access' });
        const session = await authenticateUser(api, user);

        const { status } = await postSyncCommand(session, {
            command: 'PAUSE',
            nango_connection_id: 1,
            sync_id: 'denied-sync-id',
            sync_name: 'denied-sync'
        });

        expect(status).toBe(403);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'sync',
            action: 'paused',
            outcome: 'denied',
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'sync', id: 'denied-sync-id', display: 'denied-sync' }]
        });
    });
});
