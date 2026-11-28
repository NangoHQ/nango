import { randomUUID } from 'node:crypto';

import { Client } from '@elastic/elasticsearch';

import db from '@nangohq/database';
import { nanoid } from '@nangohq/utils';

import type * as LogsModule from '@nangohq/logs';
import type { ConcatOperationList, MessageHTTPRequest, MessageRow, OperationList, OperationRow, OperationState } from '@nangohq/types';

// `meta` isn't indexed, so the id prefix is what --reset deletes by.
const SEED_PREFIX = 'seed_';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const LIVE_MAX_DURATION_MS = 60_000;
const BULK_DOCS = 5_000;

// Operations per environment per week in production: p90 is "low", p99 is "high".
const P90_ENV_WEEK = 37_113;
const P99_ENV_WEEK = 1_035_565;
const LEVELS = {
    low: P90_ENV_WEEK / 604_800,
    medium: (P90_ENV_WEEK * 10) / 604_800,
    high: P99_ENV_WEEK / 604_800
} as const;
type Level = keyof typeof LEVELS;

// Production operation counts over 7 days, by type and action.
const OPERATION_MIX: [OperationList, number][] = [
    [{ type: 'proxy', action: 'call' }, 62_423_096],
    [{ type: 'webhook', action: 'sync' }, 41_203_264],
    [{ type: 'webhook', action: 'incoming' }, 11_592_067],
    [{ type: 'webhook', action: 'forward' }, 3_651_323],
    [{ type: 'webhook', action: 'connection_refresh' }, 187_098],
    [{ type: 'webhook', action: 'connection_create' }, 10_897],
    [{ type: 'webhook', action: 'connection_delete' }, 785],
    [{ type: 'sync', action: 'run' }, 37_589_263],
    [{ type: 'sync', action: 'request_run' }, 880_799],
    [{ type: 'sync', action: 'unpause' }, 91_359],
    [{ type: 'sync', action: 'pause' }, 85_471],
    [{ type: 'sync', action: 'init' }, 3_393],
    [{ type: 'sync', action: 'request_run_full' }, 775],
    [{ type: 'action', action: 'run' }, 3_656_581],
    [{ type: 'auth', action: 'create_connection' }, 154_121],
    [{ type: 'auth', action: 'refresh_token' }, 117_098],
    [{ type: 'auth', action: 'post_connection' }, 7_726],
    [{ type: 'auth', action: 'connection_test' }, 716],
    [{ type: 'agent_session', action: 'create' }, 45_180],
    [{ type: 'agent_session', action: 'terminate' }, 37_448],
    [{ type: 'agent_session', action: 'tool_search' }, 1_674],
    [{ type: 'tool', action: 'call' }, 11_851],
    [{ type: 'deploy', action: 'custom' }, 5_324],
    [{ type: 'deploy', action: 'prebuilt' }, 221],
    [{ type: 'events', action: 'pre_connection_deletion' }, 339],
    [{ type: 'events', action: 'post_connection_creation' }, 237]
];

const STATE_MIX: [Exclude<OperationState, 'waiting' | 'running'>, number][] = [
    ['success', 144_916_898],
    ['failed', 16_690_058],
    ['cancelled', 121_683],
    ['timeout', 28_019]
];

type OperationType = OperationList['type'];
type Quantiles = [p50: number, p90: number, p99: number];

// Production p50/p90/p99 duration in ms by operation type.
const DURATION_MS: Record<OperationType, Quantiles> = {
    proxy: [255, 758, 3_605],
    webhook: [136, 7_899, 250_871],
    sync: [947, 5_605, 272_514],
    action: [1_258, 3_482, 24_127],
    auth: [10, 13_303, 194_006],
    agent_session: [71, 361, 816],
    tool: [2_235, 4_598, 8_563],
    deploy: [1_587, 6_072, 7_081],
    events: [416, 900, 2_000],
    admin: [50, 120, 300],
    function: [500, 2_000, 8_000]
};

// Tuned so the mix lands on production's lines per operation: p50 4, p90 31, p99 122.
const LINES_PER_OPERATION: Record<OperationType, Quantiles> = {
    proxy: [3, 6, 14],
    webhook: [4, 8, 30],
    sync: [20, 90, 160],
    action: [8, 30, 110],
    auth: [3, 6, 14],
    agent_session: [2, 4, 8],
    tool: [4, 10, 24],
    deploy: [6, 14, 30],
    events: [4, 10, 20],
    admin: [1, 2, 3],
    function: [4, 10, 24]
};

// Tuned so production's line mix holds: 67% http; info 81%, warn 13%, error 5.6%, debug 0.1%.
const HTTP_LINE_SHARE: Record<OperationType, number> = {
    proxy: 0.92,
    webhook: 0.8,
    sync: 0.65,
    action: 0.65,
    auth: 0.5,
    agent_session: 0.2,
    tool: 0.6,
    deploy: 0,
    events: 0.5,
    admin: 0,
    function: 0.6
};
const LOG_LINE_LEVELS: [MessageRow['level'], number][] = [
    ['info', 0.64],
    ['warn', 0.32],
    ['error', 0.037],
    ['debug', 0.003]
];
const HTTP_STATUSES: [number, number][] = [
    [200, 0.82],
    [201, 0.05],
    [204, 0.02],
    [429, 0.055],
    [404, 0.025],
    [400, 0.012],
    [401, 0.008],
    [500, 0.006],
    [502, 0.004]
];

const INTEGRATIONS: { key: string; host: string; models: string[] }[] = [
    { key: 'salesforce', host: 'acme.my.salesforce.com/services/data/v60.0', models: ['Contact', 'Account', 'Opportunity', 'Lead'] },
    { key: 'hubspot', host: 'api.hubapi.com/crm/v3/objects', models: ['Contact', 'Company', 'Deal'] },
    { key: 'google-calendar', host: 'www.googleapis.com/calendar/v3', models: ['Event', 'Calendar'] },
    { key: 'google-drive', host: 'www.googleapis.com/drive/v3', models: ['File', 'Folder'] },
    { key: 'google-mail', host: 'gmail.googleapis.com/gmail/v1/users/me', models: ['Message', 'Thread'] },
    { key: 'slack', host: 'slack.com/api', models: ['Message', 'Channel', 'User'] },
    { key: 'github', host: 'api.github.com', models: ['Issue', 'PullRequest', 'Repository'] },
    { key: 'gitlab', host: 'gitlab.com/api/v4', models: ['Issue', 'MergeRequest', 'Project'] },
    { key: 'notion', host: 'api.notion.com/v1', models: ['Page', 'Database'] },
    { key: 'linear', host: 'api.linear.app', models: ['Issue', 'Project', 'Cycle'] },
    { key: 'jira', host: 'api.atlassian.com/ex/jira/rest/api/3', models: ['Issue', 'Project', 'Sprint'] },
    { key: 'asana', host: 'app.asana.com/api/1.0', models: ['Task', 'Project'] },
    { key: 'stripe', host: 'api.stripe.com/v1', models: ['Charge', 'Customer', 'Invoice'] },
    { key: 'shopify', host: 'acme.myshopify.com/admin/api/2024-10', models: ['Order', 'Product', 'Customer'] },
    { key: 'zendesk', host: 'acme.zendesk.com/api/v2', models: ['Ticket', 'User'] },
    { key: 'intercom', host: 'api.intercom.io', models: ['Conversation', 'Contact'] },
    { key: 'microsoft-teams', host: 'graph.microsoft.com/v1.0/teams', models: ['Message', 'Channel'] },
    { key: 'outlook', host: 'graph.microsoft.com/v1.0/me', models: ['Message', 'Event'] },
    { key: 'dropbox', host: 'api.dropboxapi.com/2', models: ['File', 'Folder'] },
    { key: 'airtable', host: 'api.airtable.com/v0', models: ['Record', 'Table'] }
];

// Weekday weight by Europe/Prague hour; weekends get WEEKEND_FACTOR of it.
const HOUR_WEIGHTS = [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.4, 0.7, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.8, 0.55, 0.35, 0.2, 0.2, 0.15];
const WEEKEND_FACTOR = 0.4;
const DAILY_JITTER = 0.15;
const HOURLY_JITTER = 0.1;
const MEAN_WEEK_WEIGHT = (HOUR_WEIGHTS.reduce((a, b) => a + b, 0) * (5 + 2 * WEEKEND_FACTOR)) / (7 * 24);

interface Args {
    account: number | undefined;
    env: string | undefined;
    days: number;
    level: Level;
    live: boolean;
    reset: boolean;
    dryRun: boolean;
    allowRemote: boolean;
}

function parseArgs(): Args {
    const argv = process.argv.slice(2);
    const value = (name: string): string | undefined => {
        const i = argv.indexOf(`--${name}`);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    const fail = (message: string): never => {
        console.error(`✗ ${message}`);
        process.exit(1);
    };
    const account = value('account');
    if (account !== undefined && !/^\d+$/.test(account)) {
        fail(`--account must be a non-negative integer, got "${account}".`);
    }
    const days = value('days');
    if (days !== undefined && (!/^\d+$/.test(days) || Number(days) === 0)) {
        fail(`--days must be a positive integer, got "${days}".`);
    }
    const level = value('level') ?? 'medium';
    if (!(level in LEVELS)) {
        fail(`--level must be one of ${Object.keys(LEVELS).join(', ')}, got "${level}".`);
    }
    const live = argv.includes('--live');
    if (live && argv.includes('--dry-run')) {
        fail('--dry-run only applies to the backfill; --live always writes.');
    }
    return {
        account: account !== undefined ? Number(account) : undefined,
        env: value('env'),
        days: days !== undefined ? Number(days) : 3,
        level: level as Level,
        live,
        reset: !live && !argv.includes('--no-reset'),
        dryRun: argv.includes('--dry-run'),
        allowRemote: argv.includes('--allow-remote')
    };
}

function weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((sum, [, w]) => sum + w, 0);
    let r = Math.random() * total;
    for (const [item, w] of items) {
        r -= w;
        if (r <= 0) {
            return item;
        }
    }
    const last = items.at(-1);
    if (!last) {
        throw new Error('weighted() needs at least one item');
    }
    return last[0];
}

function pick<T>(arr: readonly T[]): T {
    return weighted(arr.map((item) => [item, 1] as const));
}

function randInt(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function fromQuantiles([p50, p90, p99]: Quantiles): number {
    const knots: [number, number][] = [
        [0, Math.max(p50 / 20, 1)],
        [0.5, p50],
        [0.9, p90],
        [0.99, p99],
        [1, p99 * 2]
    ];
    const u = Math.random();
    for (const [i, [u1, v1]] of knots.entries()) {
        const [u0, v0] = knots[i - 1] ?? [0, v1];
        if (u <= u1 && i > 0) {
            const t = (u - u0) / (u1 - u0);
            return Math.exp(Math.log(v0) + t * (Math.log(v1) - Math.log(v0)));
        }
    }
    return p99 * 2;
}

interface Connection {
    id: number;
    name: string;
    endUserId: string | undefined;
}
interface EnvIntegration {
    id: number;
    key: string;
    host: string;
    models: string[];
    connections: Connection[];
}
interface Target {
    account: { id: number; name: string };
    environment: { id: number; name: string };
    integrations: EnvIntegration[];
    share: number;
}

let fakeIds = 900_000;

function buildIntegrations(isProduction: boolean): EnvIntegration[] {
    return INTEGRATIONS.map((integration) => {
        const highVolume = Math.random() < 0.15;
        const base = highVolume ? randInt(60, 150) : randInt(2, 12);
        const count = Math.max(1, Math.round(isProduction ? base : base * 0.1));
        return {
            id: fakeIds++,
            ...integration,
            connections: Array.from({ length: count }, () => ({
                id: fakeIds++,
                name: randomUUID(),
                endUserId: Math.random() < 0.6 ? `user_${randInt(1000, 99999)}` : undefined
            }))
        };
    });
}

async function resolveTargets(args: Args): Promise<Target[]> {
    let accountId = args.account;
    if (accountId === undefined) {
        const user = await db.knex.select<{ account_id: number }[]>('account_id').from('_nango_users').where({ email: 'test@nango.dev' }).first();
        accountId = user?.account_id;
    }
    if (accountId === undefined) {
        const first = await db.knex
            .select<{ id: number }[]>('account_id as id')
            .from('_nango_environments')
            .where({ deleted: false })
            .groupBy('account_id')
            .orderBy('account_id')
            .first();
        accountId = first?.id;
    }
    if (accountId === undefined) {
        return [];
    }
    const account = await db.knex.select<{ id: number; name: string }[]>('id', 'name').from('_nango_accounts').where({ id: accountId }).first();
    if (!account) {
        return [];
    }
    let environments = await db.knex
        .select<{ id: number; name: string; isProduction: boolean }[]>('id', 'name', { isProduction: 'is_production' })
        .from('_nango_environments')
        .where({ account_id: accountId, deleted: false })
        .orderBy('id');
    if (args.env) {
        environments = environments.filter((e) => e.name === args.env);
    }
    const prodCount = environments.filter((e) => e.isProduction).length;
    const otherCount = environments.length - prodCount;
    return environments.map((env) => {
        let share = 1 / environments.length;
        if (prodCount > 0 && otherCount > 0) {
            share = env.isProduction ? 0.9 / prodCount : 0.1 / otherCount;
        }
        return {
            account,
            environment: { id: env.id, name: env.name },
            integrations: buildIntegrations(env.isProduction),
            share
        };
    });
}

/** The level is the busiest environment's rate. The others scale down by their share. */
function targetRate(level: Level, target: Target, targets: Target[]): number {
    const maxShare = Math.max(...targets.map((t) => t.share));
    return (LEVELS[level] * target.share) / maxShare;
}

function pickConnection(target: Target): { integration: EnvIntegration; connection: Connection } {
    const integration = weighted(target.integrations.map((i) => [i, i.connections.length] as const));
    return { integration, connection: pick(integration.connections) };
}

function kebab(model: string): string {
    return model.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function functionName(operation: OperationList, integration: EnvIntegration): string {
    const model = pick(integration.models);
    if (operation.type === 'action' || operation.type === 'tool') {
        return `${pick(['create', 'update', 'get', 'delete'])}-${kebab(model)}`;
    }
    if (operation.type === 'events') {
        return operation.action === 'post_connection_creation' ? 'fetch-account-info' : 'cleanup-webhooks';
    }
    return `${kebab(model)}s`;
}

interface Generated {
    operation: OperationRow;
    lines: MessageRow[];
    durationMs: number;
    finalState: Exclude<OperationState, 'waiting' | 'running'>;
}

const NO_CONNECTION_TYPES = new Set<OperationType>(['agent_session', 'deploy', 'admin']);
const FUNCTION_TYPES = new Set<OperationType>(['sync', 'action', 'tool', 'events']);
const FUNCTION_WEBHOOK_ACTIONS = new Set<string>(['sync', 'incoming']);

function hasFunction(op: OperationList): boolean {
    return FUNCTION_TYPES.has(op.type) || (op.type === 'webhook' && FUNCTION_WEBHOOK_ACTIONS.has(op.action));
}

function httpLine(
    base: Pick<MessageRow, 'parentId' | 'accountId'>,
    op: OperationList,
    integration: EnvIntegration | undefined,
    at: number,
    forceError: boolean
): MessageRow {
    let method = 'GET';
    if (op.type === 'action' || op.type === 'tool') {
        method = pick(['GET', 'POST', 'POST', 'PATCH']);
    } else if (op.type === 'proxy') {
        method = pick(['GET', 'GET', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    } else if (op.type === 'webhook' || op.type === 'auth') {
        method = 'POST';
    }
    let url = `https://${integration?.host ?? 'api.nango.dev'}/${kebab(pick(integration?.models ?? ['Resource']))}s`;
    if (op.type === 'webhook' && op.action !== 'incoming') {
        url = 'https://hooks.example.com/nango/webhooks';
    } else if (op.type === 'auth') {
        url = `https://${integration?.host.split('/')[0] ?? 'auth.example.com'}/oauth/token`;
    } else if (method === 'GET' && Math.random() < 0.5) {
        url += `?limit=100&cursor=${nanoid(12)}`;
    }
    const code = forceError ? pick([400, 404, 500, 502]) : weighted(HTTP_STATUSES);
    let level: MessageRow['level'] = 'info';
    if (code === 429) {
        level = 'warn';
    } else if (code >= 400) {
        level = 'error';
    }
    const durationMs = Math.round(fromQuantiles([180, 700, 3_000]));
    const request: MessageHTTPRequest = { url, method, headers: { 'Content-Type': 'application/json', Authorization: 'REDACTED' } };
    let contextValue: MessageRow['context'] = 'script';
    if (op.type === 'proxy') {
        contextValue = 'proxy';
    } else if (op.type === 'webhook') {
        contextValue = 'webhook';
    } else if (op.type === 'auth') {
        contextValue = 'auth';
    }
    return {
        id: nanoid(),
        ...base,
        source: 'internal',
        level,
        type: 'http',
        message: `${method} ${url}`,
        context: contextValue,
        request,
        response: { code, headers: { 'Content-Type': 'application/json' } },
        retry: code === 429 ? { attempt: randInt(1, 3), max: 3, waited: randInt(1, 30) * 1000 } : undefined,
        createdAt: new Date(at).toISOString(),
        endedAt: new Date(at + durationMs).toISOString(),
        durationMs
    };
}

function logLine(
    base: Pick<MessageRow, 'parentId' | 'accountId'>,
    level: MessageRow['level'],
    message: string,
    at: number,
    extra: Partial<MessageRow> = {}
): MessageRow {
    return { id: nanoid(), ...base, source: 'internal', level, type: 'log', message, createdAt: new Date(at).toISOString(), ...extra };
}

function middleLogLine(base: Pick<MessageRow, 'parentId' | 'accountId'>, op: OperationList, integration: EnvIntegration | undefined, at: number): MessageRow {
    const level = weighted(LOG_LINE_LEVELS);
    const model = pick(integration?.models ?? ['Record']);
    switch (level) {
        case 'warn':
            return logLine(
                base,
                level,
                pick([
                    `Rate limited by ${integration?.key ?? 'provider'}, retrying in ${randInt(1, 30)}s`,
                    `Skipping ${model} record without an id`,
                    `Field "${pick(['email', 'owner', 'updated_at', 'external_id'])}" missing on ${model}, using default`,
                    'Response took longer than expected'
                ]),
                at
            );
        case 'error':
            return logLine(base, level, pick([`Failed to map ${model} record`, 'Validation failed for 1 record', 'Unexpected response shape']), at, {
                error: { name: 'Error', message: 'Record failed validation' }
            });
        case 'debug':
            return logLine(base, level, `Cursor ${nanoid(16)}`, at);
        default:
            break;
    }
    if (op.type === 'sync' && Math.random() < 0.4) {
        const added = randInt(0, 100);
        const updated = randInt(0, 100 - added);
        return logLine(base, 'info', `Batch saved ${added + updated} ${model} records`, at, {
            persistResults: {
                model,
                added,
                addedKeys: [],
                updated,
                updatedKeys: [],
                unchanged: 0,
                unchangedKeys: [],
                deleted: 0,
                deleteKeys: []
            }
        });
    }
    return logLine(
        base,
        'info',
        pick([`Fetched page of ${model} records`, `Processing ${randInt(10, 500)} ${model} records`, 'Continuing from saved cursor']),
        at
    );
}

function firstLine(op: OperationList, name: string | undefined, integration: EnvIntegration | undefined): string {
    switch (op.type) {
        case 'sync':
            return `Starting sync "${name}"`;
        case 'action':
            return `Running action "${name}"`;
        case 'tool':
            return `Calling tool "${name}"`;
        case 'webhook':
            return op.action === 'incoming' ? `Received webhook from ${integration?.key}` : 'Sending webhook';
        case 'auth':
            return op.action === 'refresh_token' ? 'Refreshing access token' : 'Starting connection flow';
        case 'deploy':
            return 'Deploying functions';
        case 'agent_session':
            return 'Agent session request received';
        default:
            return 'Operation started';
    }
}

function generate(logs: typeof LogsModule, target: Target, createdAt: number, now: number, durationCapMs: number): Generated {
    const op = weighted(OPERATION_MIX);
    const finalState = weighted(STATE_MIX);
    const durationMs = Math.min(Math.round(fromQuantiles(DURATION_MS[op.type])), durationCapMs);
    const endedAt = createdAt + durationMs;

    const hasConnection = !NO_CONNECTION_TYPES.has(op.type);
    const picked = hasConnection ? pickConnection(target) : undefined;
    const integration = picked?.integration;
    const name = integration && hasFunction(op) ? functionName(op, integration) : undefined;

    const id = `${SEED_PREFIX}${createdAt}_${nanoid(6)}`;
    const base = { parentId: id, accountId: target.account.id };

    const errorMessage = finalErrorMessage(op, finalState);
    const minLines = finalState === 'success' ? 1 : 2;
    const count = Math.max(minLines, Math.round(fromQuantiles(LINES_PER_OPERATION[op.type])));
    const lines: MessageRow[] = [];
    for (let i = 0; i < count; i++) {
        const at = createdAt + Math.round((durationMs * i) / count);
        const last = i === count - 1 && count > 1;
        if (i === 0 && op.type !== 'proxy') {
            lines.push(logLine(base, 'info', firstLine(op, name, integration), at));
        } else if (last && finalState !== 'success') {
            if (op.type === 'proxy' && finalState === 'failed') {
                lines.push(httpLine(base, op, integration, at, true));
            } else {
                lines.push(logLine(base, 'error', errorMessage, at, { error: { name: 'Error', message: errorMessage } }));
            }
        } else if (Math.random() < HTTP_LINE_SHARE[op.type]) {
            lines.push(httpLine(base, op, integration, at, false));
        } else {
            lines.push(middleLogLine(base, op, integration, at));
        }
    }

    const ended = endedAt <= now;
    const state: OperationState = ended ? finalState : 'running';
    const row: OperationRow = {
        id,
        source: 'internal',
        level: state === 'failed' || state === 'timeout' ? 'error' : 'info',
        type: 'operation',
        message: logs.operationTypeToMessage[`${op.type}:${op.action}` as ConcatOperationList],
        operation: op,
        state,
        accountId: target.account.id,
        accountName: target.account.name,
        environmentId: target.environment.id,
        environmentName: target.environment.name,
        providerName: integration?.key,
        integrationId: integration?.id,
        integrationName: integration?.key,
        connectionId: picked?.connection.id,
        connectionName: picked?.connection.name,
        endUserId: picked?.connection.endUserId,
        syncConfigId: name ? fakeIds++ : undefined,
        syncConfigName: name,
        actor: op.type === 'agent_session' || op.type === 'tool' ? { kind: 'session', id: `as_${nanoid(12)}` } : undefined,
        error: ended && finalState === 'failed' ? { name: 'Error', message: errorMessage } : undefined,
        createdAt: new Date(createdAt).toISOString(),
        updatedAt: new Date(Math.min(endedAt, now)).toISOString(),
        startedAt: new Date(createdAt).toISOString(),
        endedAt: ended ? new Date(endedAt).toISOString() : null,
        expiresAt: new Date(createdAt + DAY).toISOString()
    };
    return { operation: row, lines: lines.filter((l) => Date.parse(l.createdAt) <= now), durationMs, finalState };
}

function finalErrorMessage(op: OperationList, state: Generated['finalState']): string {
    if (state === 'cancelled') {
        return 'Execution was cancelled';
    }
    if (state === 'timeout') {
        return 'Execution timed out';
    }
    if (op.type === 'proxy') {
        return 'Proxy request failed';
    }
    return pick([
        'Request failed with status code 500',
        'Request failed with status code 401',
        'Script failed: Cannot read properties of undefined',
        'Invalid output'
    ]);
}

function pragueHour(ts: number): { hour: number; weekend: boolean } {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(ts);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    return { hour, weekend: weekday === 'Sat' || weekday === 'Sun' };
}

function hourWeight(ts: number): number {
    const { hour, weekend } = pragueHour(ts);
    return (HOUR_WEIGHTS[hour] ?? 0) * (weekend ? WEEKEND_FACTOR : 1);
}

class BulkWriter {
    private ops: unknown[] = [];
    private messages: unknown[] = [];

    constructor(
        private readonly es: Client | null,
        private readonly logs: typeof LogsModule
    ) {}

    async add(g: Generated) {
        this.ops.push({ create: { _id: g.operation.id } }, g.operation);
        for (const line of g.lines) {
            this.messages.push({ create: {} }, line);
        }
        if (this.ops.length + this.messages.length >= BULK_DOCS * 2) {
            await this.flush();
        }
    }

    async flush() {
        await this.write(this.logs.indexOperations.index, this.ops);
        this.ops = [];
        await this.write(this.logs.indexMessages.index, this.messages);
        this.messages = [];
    }

    private async write(index: string, operations: unknown[]) {
        if (!this.es || operations.length === 0) {
            return;
        }
        for (let i = 0; i < operations.length; i += BULK_DOCS * 2) {
            const res = await this.es.bulk({
                index,
                pipeline: this.logs.getLogsIngestPipelineId(index),
                refresh: false,
                operations: operations.slice(i, i + BULK_DOCS * 2)
            });
            if (res.errors) {
                const failed = res.items.find((item) => Object.values(item)[0]?.error);
                throw new Error(`Bulk write to ${index} failed: ${JSON.stringify(failed)}`);
            }
        }
    }
}

async function backfill(args: Args, targets: Target[], es: Client | null, logs: typeof LogsModule) {
    const now = Date.now();
    const start = now - args.days * DAY;
    const writer = new BulkWriter(es, logs);
    const stats = new Stats();
    const dayJitter = new Map<string, number>();

    let currentDay = '';
    for (let t = Math.floor(start / HOUR) * HOUR; t < now; t += HOUR) {
        const from = Math.max(t, start);
        const to = Math.min(t + HOUR, now);
        const day = new Date(t).toISOString().slice(0, 10);
        if (day !== currentDay) {
            if (currentDay) {
                console.log(`  ${currentDay}: ${stats.operations} operations so far`);
            }
            currentDay = day;
        }
        const jitter = dayJitter.get(day) ?? 1 + (Math.random() * 2 - 1) * DAILY_JITTER;
        dayJitter.set(day, jitter);
        for (const target of targets) {
            const hourJitter = 1 + (Math.random() * 2 - 1) * HOURLY_JITTER;
            const expected = ((targetRate(args.level, target, targets) * (to - from)) / 1000) * (hourWeight(t) / MEAN_WEEK_WEIGHT) * jitter * hourJitter;
            const n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
            for (let i = 0; i < n; i++) {
                const g = generate(logs, target, Math.floor(from + Math.random() * (to - from)), now, Infinity);
                stats.add(g);
                await writer.add(g);
            }
        }
    }
    await writer.flush();
    if (es) {
        await es.indices.refresh({ index: [`${logs.indexOperations.index}*`, `${logs.indexMessages.index}*`] });
    }
    stats.print();
}

class Stats {
    operations = 0;
    private types = new Map<string, number>();
    private states = new Map<string, number>();
    private lineCounts: number[] = [];
    private lineTypes = new Map<string, number>();
    private lineLevels = new Map<string, number>();

    add(g: Generated) {
        this.operations++;
        this.bump(this.types, g.operation.operation.type);
        this.bump(this.states, g.operation.state);
        this.lineCounts.push(g.lines.length);
        for (const line of g.lines) {
            this.bump(this.lineTypes, line.type);
            this.bump(this.lineLevels, line.level);
        }
    }

    print() {
        const lines = this.lineCounts.reduce((a, b) => a + b, 0);
        const sorted = [...this.lineCounts].sort((a, b) => a - b);
        const q = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
        const pct = (m: Map<string, number>, total: number) =>
            [...m.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `${k} ${((v / total) * 100).toFixed(1)}%`)
                .join(', ');
        console.log(`\n✓ ${this.operations} operations, ${lines} log lines`);
        console.log(`  types: ${pct(this.types, this.operations)}`);
        console.log(`  states: ${pct(this.states, this.operations)}`);
        console.log(`  lines per operation: p50 ${q(0.5)}, p90 ${q(0.9)}, p99 ${q(0.99)}`);
        console.log(`  line types: ${pct(this.lineTypes, lines)}`);
        console.log(`  line levels: ${pct(this.lineLevels, lines)}`);
    }

    private bump(m: Map<string, number>, key: string) {
        m.set(key, (m.get(key) ?? 0) + 1);
    }
}

async function live(args: Args, targets: Target[], logs: typeof LogsModule) {
    const rate = targets.reduce((sum, t) => sum + targetRate(args.level, t, targets), 0);
    const running = new Map<string, OperationRow>();
    const timers = new Set<NodeJS.Timeout>();
    const inflight = new Set<Promise<void>>();
    let created = 0;
    let stopping = false;

    const later = (ms: number, fn: () => Promise<void>) => {
        const timer = setTimeout(() => {
            timers.delete(timer);
            const pending = fn()
                .catch((err: unknown) => console.error(err))
                .finally(() => inflight.delete(pending));
            inflight.add(pending);
        }, ms);
        timers.add(timer);
    };

    const spawn = async () => {
        const target = weighted(targets.map((t) => [t, t.share] as const));
        const now = Date.now();
        const g = generate(logs, target, now, Infinity, LIVE_MAX_DURATION_MS);
        const row: OperationRow = { ...g.operation, state: 'running', endedAt: null, error: undefined, level: 'info' };
        await logs.modelOperations.createOperation(row);
        running.set(row.id, row);
        created++;
        if (stopping) {
            return;
        }
        const { type, action } = row.operation;
        console.log(
            `${new Date(now).toISOString().slice(11, 19)}  ${`${type}:${action}`.padEnd(28)} ${(row.integrationName ?? '-').padEnd(16)} → ${g.finalState} in ${(g.durationMs / 1000).toFixed(1)}s`
        );

        for (const line of g.lines) {
            later(Date.parse(line.createdAt) - now, async () => {
                await logs.modelMessages.createMessage(line);
            });
        }
        later(g.durationMs, async () => {
            if (!running.delete(row.id)) {
                return;
            }
            await logs.modelOperations.updateOperation({
                id: row.id,
                data: {
                    createdAt: row.createdAt,
                    state: g.finalState,
                    level: g.finalState === 'failed' || g.finalState === 'timeout' ? 'error' : 'info',
                    endedAt: new Date().toISOString(),
                    ...(g.operation.error ? { error: g.operation.error } : {})
                }
            });
        });
    };

    const scheduleNext = () => {
        if (stopping) {
            return;
        }
        later(-Math.log(1 - Math.random()) * (1000 / rate), async () => {
            scheduleNext();
            await spawn();
        });
    };

    const cancelRunning = async () => {
        await Promise.allSettled(inflight);
        const endedAt = new Date().toISOString();
        console.log(`\nStopping: cancelling ${running.size} running operation(s)…`);
        const results = await Promise.allSettled(
            [...running.values()].map((row) =>
                logs.modelOperations.updateOperation({ id: row.id, data: { createdAt: row.createdAt, state: 'cancelled', endedAt } })
            )
        );
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
            console.error(`✗ ${failed} operation(s) could not be cancelled and stay running until they expire.`);
        }
    };

    console.log(`Live feed at ${args.level} (~${rate.toFixed(2)} operations/s) into ${targets.map((t) => t.environment.name).join(', ')}. Ctrl+C to stop.\n`);
    const summary = setInterval(() => console.log(`  … ${created} created, ${running.size} running`), 30_000);
    scheduleNext();

    await new Promise<void>((resolve) => {
        process.once('SIGINT', () => {
            stopping = true;
            clearInterval(summary);
            for (const timer of timers) {
                clearTimeout(timer);
            }
            void cancelRunning().finally(() => resolve());
        });
    });
}

async function main() {
    const args = parseArgs();

    process.env['NANGO_LOGS_ES_URL'] ||= 'http://localhost:9500';
    const esUrl = process.env['NANGO_LOGS_ES_URL'];
    const host = new URL(esUrl).hostname;
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) && !args.allowRemote) {
        console.error(`✗ Refusing to write synthetic logs to non-local Elasticsearch host "${host}". Pass --allow-remote to override.`);
        process.exit(1);
    }

    // The logs package builds its storage client from env at import time, so it's loaded after the URL default is set.
    const logs = await import('@nangohq/logs');

    const targets = await resolveTargets(args);
    if (targets.length === 0) {
        console.error('✗ No matching account or environment. Sign up locally first, or check --account / --env.');
        process.exit(1);
    }

    const user = process.env['NANGO_LOGS_ES_USER'];
    const auth = user ? { auth: { username: user, password: process.env['NANGO_LOGS_ES_PWD'] ?? '' } } : {};
    const es = args.dryRun ? null : new Client({ node: esUrl, ...auth });

    if (es) {
        const migrated = await logs.migrateLogsMapping();
        if (migrated.isErr()) {
            console.error(`✗ Could not reach or migrate Elasticsearch at ${esUrl}: ${migrated.error.message}. Is it up (npm run dev:docker)?`);
            process.exit(1);
        }
    }

    if (args.live) {
        await live(args, targets, logs);
        return;
    }

    if (args.reset && es) {
        const deleted = await Promise.all([
            es.deleteByQuery({ index: `${logs.indexOperations.index}*`, query: { prefix: { id: SEED_PREFIX } }, conflicts: 'proceed', refresh: true }),
            es.deleteByQuery({ index: `${logs.indexMessages.index}*`, query: { prefix: { parentId: SEED_PREFIX } }, conflicts: 'proceed', refresh: true })
        ]);
        console.log(`Removed ${deleted[0].deleted ?? 0} seeded operations and ${deleted[1].deleted ?? 0} lines.`);
    }

    console.log(
        `${args.dryRun ? 'Dry run: generating' : 'Seeding'} ${args.days} day(s) at ${args.level} into ${targets[0]?.account.name}: ${targets.map((t) => t.environment.name).join(', ')}`
    );
    await backfill(args, targets, es, logs);
}

main()
    .then(async () => {
        await db.knex.destroy();
        process.exit(0);
    })
    .catch(async (err: unknown) => {
        console.error(err);
        await db.knex.destroy();
        process.exit(1);
    });
