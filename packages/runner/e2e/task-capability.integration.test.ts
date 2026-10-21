import { generateKeyPairSync } from 'node:crypto';

import getPort from 'get-port';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import type { Server } from 'node:http';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const jobsPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const jobsRaw = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
    .subarray(12)
    .toString('base64url');
process.env['NANGO_INTERNAL_AUTH_JOBS_PRIVATE_KEY'] = jobsPem;
process.env['NANGO_INTERNAL_AUTH_JOBS_KEY_ID'] = 'jobs-2026-09';
process.env['NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS'] = JSON.stringify([{ kid: 'jobs-2026-09', publicKey: jobsRaw }]);
process.env['NANGO_INTERNAL_AUTH_OMIT_SECRET_KEY'] = 'true';
process.env['NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED'] = 'true';

describe('task capability token end to end', () => {
    const closers: (() => Promise<void>)[] = [];
    let persistUrl = '';
    let token = '';
    let environmentId = 0;
    let nangoConnectionId = 0;

    beforeAll(async () => {
        const orchestratorPort = await getPort();
        const persistPort = await getPort();
        process.env['ORCHESTRATOR_SERVICE_URL'] = `http://127.0.0.1:${orchestratorPort}`;
        process.env['PERSIST_SERVICE_URL'] = `http://127.0.0.1:${persistPort}`;
        persistUrl = process.env['PERSIST_SERVICE_URL'];

        const { InMemorySlidingWindowRateLimiter } = await import('@nangohq/kvstore');
        const { getTestDbClient, Scheduler } = await import('@nangohq/scheduler');
        const { OrchestratorClient, OrchestratorProcessor } = await import('@nangohq/nango-orchestrator');
        const { TaskEventsHandler } = await import('@nangohq/nango-orchestrator/dist/events.js');
        const { getServer } = await import('@nangohq/nango-orchestrator/dist/server.js');
        const dbClient = getTestDbClient('task_capability_e2e');
        await dbClient.migrate();
        const eventsHandler = new TaskEventsHandler(dbClient.db);
        const scheduler = new Scheduler({ db: dbClient.db, on: eventsHandler.onCallbacks, onError: () => {} });
        const rateLimiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'task-capability-e2e', limit: 1_000_000, windowMs: 60_000 });
        const orchestrator = getServer(scheduler, eventsHandler, rateLimiter);
        const orchestratorServer = await listen(orchestrator, orchestratorPort);
        const orchestratorClient = new OrchestratorClient({ baseUrl: process.env['ORCHESTRATOR_SERVICE_URL'] });
        const processor = new OrchestratorProcessor({
            orchestratorClient,
            groupKeyPattern: 'action:*',
            maxConcurrency: 1,
            handler: async (task) => {
                const done = await orchestratorClient.succeed({ taskId: task.id, output: { from: 'action' } });
                return done.isErr() ? Err(new Error(done.error.message)) : Ok(undefined);
            }
        });
        processor.start();
        closers.push(async () => {
            await processor.stop();
            scheduler.stop();
            await rateLimiter.destroy();
            await new Promise<void>((resolve) => orchestratorServer.close(() => resolve()));
            await dbClient.clearDatabase();
            await dbClient.destroy();
        });

        const db = (await import('@nangohq/database')).default;
        const { multipleMigrations } = await import('@nangohq/database');
        const { records } = await import('@nangohq/records');
        const { migrateLogsMapping } = await import('@nangohq/logs');
        const { configService, connectionService, createPlan, createSync, createSyncJob, environmentService, getProvider, seeders, SyncJobsType, SyncStatus } =
            await import('@nangohq/shared');
        const { runServer } = await import('@nangohq/nango-server/dist/utils/tests.js');
        const { server: persistServer } = await import('@nangohq/nango-persist/dist/server.js');
        const { exec } = await import('@nangohq/nango-runner');
        const { runnerAuth } = await import('@nangohq/nango-jobs/dist/internal-auth.js');

        await multipleMigrations();
        await records.migrate();
        await migrateLogsMapping();

        const account = await seeders.createAccount();
        const env = (await environmentService.createEnvironment(db.knex, { accountId: account.id, name: `task-cap-${Date.now()}` })).unwrap();
        (await createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();
        const provider = getProvider('github');
        if (!provider) {
            throw new Error('github provider not found');
        }
        const uniqueKey = `github-${Date.now()}`;
        const providerConfig = await configService.createProviderConfig(
            {
                unique_key: uniqueKey,
                provider: 'github',
                environment_id: env.id,
                oauth_client_id: '',
                oauth_client_secret: '',
                missing_fields: [],
                forward_webhooks: true,
                shared_credentials_id: null
            },
            provider
        );
        if (!providerConfig) {
            throw new Error('provider config not created');
        }
        const now = new Date();
        const [syncConfig] = await db.knex
            .from('_nango_sync_configs')
            .insert({
                environment_id: env.id,
                sync_name: 'issues',
                type: 'sync',
                file_location: 'file_location',
                nango_config_id: providerConfig.id!,
                version: '1',
                active: true,
                runs: 'every day',
                track_deletes: false,
                auto_start: false,
                webhook_subscriptions: [],
                enabled: true,
                created_at: now,
                updated_at: now,
                models: ['Account'],
                sync_type: 'full',
                source: 'repo'
            })
            .returning('*');
        await db.knex.from('_nango_sync_configs').insert({
            environment_id: env.id,
            sync_name: 'echo',
            type: 'action',
            file_location: 'file_location',
            nango_config_id: providerConfig.id!,
            version: '1',
            active: true,
            runs: null,
            track_deletes: false,
            auto_start: false,
            webhook_subscriptions: [],
            enabled: true,
            created_at: now,
            updated_at: now,
            models: [],
            sync_type: null,
            source: 'repo'
        });
        const connectionId = `conn-${Date.now()}`;
        const connectionRes = await connectionService.upsertConnection({
            connectionId,
            providerConfigKey: uniqueKey,
            parsedRawCredentials: { type: 'API_KEY', apiKey: 'provider-key' } as never,
            connectionConfig: {},
            environmentId: env.id,
            tags: {}
        });
        const createdConnectionId = connectionRes[0]?.connection.id;
        if (!createdConnectionId || !syncConfig) {
            throw new Error('seed failed');
        }
        const connection = await connectionService.getConnectionById(createdConnectionId);
        if (!connection) {
            throw new Error('connection not found');
        }
        const sync = await createSync({ connectionId: connection.id, syncConfig, variant: 'base' });
        if (!sync?.id) {
            throw new Error('sync not created');
        }
        const syncJob = await createSyncJob({
            sync_id: sync.id,
            type: SyncJobsType.FULL,
            status: SyncStatus.RUNNING,
            job_id: `job-${Date.now()}`,
            nangoConnection: connection
        });
        if (!syncJob) {
            throw new Error('sync job not created');
        }

        const persistHttp = await listen(persistServer, persistPort);
        closers.push(
            () =>
                new Promise((resolve) => {
                    persistHttp.close(() => resolve());
                })
        );
        const api = await runServer();
        closers.push(
            () =>
                new Promise((resolve) => {
                    api.server.close(() => resolve());
                })
        );

        environmentId = env.id;
        nangoConnectionId = connection.id;
        const props = {
            scriptType: 'sync' as const,
            host: api.url,
            secretKey: 'should-be-omitted',
            team: { id: account.id, name: account.name },
            connectionId,
            environmentId: env.id,
            environmentName: env.name,
            activityLogId: 'taskcapabilitye2elog000',
            providerConfigKey: uniqueKey,
            provider: 'github',
            syncId: sync.id,
            syncVariant: 'base',
            variant: 'base',
            nangoConnectionId: connection.id,
            syncJobId: syncJob.id,
            syncConfig,
            debug: false,
            startedAt: new Date(),
            endUser: null,
            runnerFlags: {
                validateActionInput: false,
                validateActionOutput: false,
                validateWebhookInput: false,
                validateWebhookOutput: false,
                validateSyncRecords: false,
                validateSyncMetadata: false,
                exportRunnerTelemetry: false
            },
            logger: { level: 'off' as const }
        };
        const syncAuth = await runnerAuth('task-sync', props);
        token = syncAuth.internalAuthToken ?? '';
        expect(syncAuth.nangoProps.secretKey).toBeUndefined();
        expect(syncAuth.nangoProps.taskAuthToken).toBe(token);

        const saved = await exec({
            nangoProps: syncAuth.nangoProps,
            code: `exports.default = async (nango) => { await nango.batchSave([{ id: 'rec-1', name: 'ada' }], 'Account'); return 'saved'; };`
        });
        if (saved.isErr()) {
            throw saved.error;
        }

        const actionAuth = await runnerAuth('task-action', { ...props, scriptType: 'action', syncId: undefined });
        // The runner denylist always includes loopback, and loopback literals stay blocked, so this
        // proxy cannot reach a local stub. The policy error is local: an API 401 would be a different code.
        const ran = await exec({
            nangoProps: actionAuth.nangoProps,
            code: `exports.default = async (nango) => {
                const connection = await nango.getConnection();
                let proxyFailure = null;
                try {
                    await nango.proxy({ method: 'GET', endpoint: '/', baseUrlOverride: 'http://127.0.0.1:9/' });
                } catch (err) {
                    proxyFailure = { code: err && err.code, status: (err && err.response && err.response.status) || null };
                }
                const triggered = await nango.triggerAction('${uniqueKey}', '${connectionId}', 'echo', { ping: true });
                return { connectionId: connection.connection_id, proxyFailure, triggered };
            };`
        });
        if (ran.isErr()) {
            throw ran.error;
        }
        const output = ran.value.output as {
            connectionId: string;
            proxyFailure: { code: string; status: number | null };
            triggered: { from: string };
        };
        expect(output.connectionId).toBe(connectionId);
        expect(output.proxyFailure).toEqual({ code: 'base_url_override_not_allowed', status: null });
        expect(output.triggered).toEqual({ from: 'action' });
    }, 120_000);

    afterAll(async () => {
        for (const close of closers.reverse()) {
            await close();
        }
    });

    it('lands the sync record and rejects the token on another connection', async () => {
        const own = await fetch(`${persistUrl}/environment/${environmentId}/connection/${nangoConnectionId}/records?model=Account&limit=10`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        expect(own.status).toBe(200);
        const body = (await own.json()) as { records: { id: string }[] };
        expect(body.records.map((record) => record.id)).toContain('rec-1');

        const forged = await fetch(`${persistUrl}/environment/${environmentId}/connection/${nangoConnectionId + 1}/records?model=Account&limit=10`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        expect(forged.status).toBe(401);
    });
});

function listen(server: { listen: (port: number, host: string, cb: () => void) => Server }, port: number): Promise<Server> {
    return new Promise((resolve) => {
        const httpServer = server.listen(port, '127.0.0.1', () => resolve(httpServer));
    });
}
