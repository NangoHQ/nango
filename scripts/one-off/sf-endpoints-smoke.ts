import { readFile } from 'node:fs/promises';
import path from 'node:path';

type FunctionType = 'action' | 'sync';

interface Args {
    host: string;
    secretKey: string;
    integrationId: string;
    connectionId?: string;
    environment: string;
    functionType: FunctionType;
    functionName: string;
    codeFile?: string;
    testInput?: unknown;
    metadata?: unknown;
    checkpoint?: unknown;
    lastSyncDate?: string;
    skipDeploy: boolean;
    skipRun: boolean;
}

const actionTemplate = `import { createAction } from 'nango';
import * as z from 'zod';

export default createAction({
    description: 'sf-run smoke action',
    input: z.object({ value: z.string() }),
    output: z.object({ ok: z.boolean(), echoed: z.string() }),
    exec: async (_nango, input) => {
        return { ok: true, echoed: input.value };
    }
});
`;

const syncTemplate = `import { createSync } from 'nango';
import * as z from 'zod';

export default createSync({
    description: 'sf-run smoke sync',
    frequency: 'every hour',
    models: {
        SmokeRecord: z.object({
            id: z.string(),
            value: z.string()
        })
    },
    exec: async (nango) => {
        await nango.batchSave([{ id: 'smoke-1', value: 'hello-from-sync' }], 'SmokeRecord');
    }
});
`;

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args) {
        process.exit(1);
    }

    const code = args.codeFile ? await readFile(path.resolve(args.codeFile), 'utf8') : args.functionType === 'action' ? actionTemplate : syncTemplate;

    console.log('--- SF endpoint smoke test ---');
    console.log(`host          : ${args.host}`);
    console.log(`environment   : ${args.environment}`);
    console.log(`integration   : ${args.integrationId}`);
    console.log(`connection    : ${args.connectionId || '[not used]'}`);
    console.log(`function type : ${args.functionType}`);
    console.log(`function name : ${args.functionName}`);
    console.log(`mode          : ${getModeLabel(args)}`);
    console.log('');

    if (!args.skipDeploy) {
        console.log('1) Deploying function via /sf-deploy...');
        const deployResponse = await postJson({
            host: args.host,
            secretKey: args.secretKey,
            endpoint: '/sf-deploy',
            body: {
                integration_id: args.integrationId,
                function_name: args.functionName,
                function_type: args.functionType,
                code,
                environment: args.environment
            }
        });
        printResponse(deployResponse);
        console.log('');
    }

    if (!args.skipRun) {
        console.log('2) Running function via /sf-run...');
        const runResponse = await postJson({
            host: args.host,
            secretKey: args.secretKey,
            endpoint: '/sf-run',
            body: {
                integration_id: args.integrationId,
                function_name: args.functionName,
                function_type: args.functionType,
                connection_id: args.connectionId,
                environment: args.environment,
                ...(args.functionType === 'action' ? { test_input: args.testInput ?? { value: 'hello-from-sf-run' } } : {}),
                ...(args.functionType === 'sync' && args.metadata !== undefined ? { metadata: args.metadata } : {}),
                ...(args.functionType === 'sync' && args.checkpoint !== undefined ? { checkpoint: args.checkpoint } : {}),
                ...(args.functionType === 'sync' && args.lastSyncDate ? { last_sync_date: args.lastSyncDate } : {})
            }
        });
        printResponse(runResponse);
    }
}

function getModeLabel(args: Pick<Args, 'skipDeploy' | 'skipRun'>): string {
    if (args.skipDeploy) {
        return 'run-only';
    }
    if (args.skipRun) {
        return 'deploy-only';
    }
    return 'deploy+run';
}

async function postJson({ host, secretKey, endpoint, body }: { host: string; secretKey: string; endpoint: string; body: Record<string, unknown> }) {
    const base = host.endsWith('/') ? host.slice(0, -1) : host;
    const response = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const raw = await response.text();
    let parsed: unknown = raw;
    try {
        parsed = JSON.parse(raw);
    } catch {
        // Keep raw as string.
    }

    if (!response.ok) {
        console.error(`Request failed (${response.status}) on ${endpoint}`);
        console.error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));
        process.exit(1);
    }

    return parsed;
}

function printResponse(payload: unknown) {
    if (typeof payload === 'string') {
        console.log(payload);
        return;
    }
    console.log(JSON.stringify(payload, null, 2));
}

function parseArgs(argv: string[]): Args | null {
    if (argv.includes('--help') || argv.includes('-h')) {
        printHelp();
        return null;
    }

    const get = (key: string) => {
        const idx = argv.indexOf(key);
        if (idx === -1) {
            return undefined;
        }
        return argv[idx + 1];
    };

    const parseJsonArg = (value: string | undefined, key: string): unknown => {
        if (!value) {
            return undefined;
        }
        try {
            return JSON.parse(value);
        } catch {
            throw new Error(`Invalid JSON passed to ${key}: ${value}`);
        }
    };

    const host = get('--host') || process.env['NANGO_HOSTPORT'] || 'http://localhost:3003';
    const secretKey = get('--secret-key') || process.env['NANGO_SECRET_KEY'] || '';
    const integrationId = get('--integration-id') || process.env['SF_INTEGRATION_ID'] || '';
    const connectionId = get('--connection-id') || process.env['SF_CONNECTION_ID'] || '';
    const environment = get('--environment') || process.env['SF_ENVIRONMENT'] || 'dev';
    const functionType = (get('--function-type') || 'action') as FunctionType;
    const skipDeploy = argv.includes('--skip-deploy');
    const skipRun = argv.includes('--skip-run') || argv.includes('--deploy-only');
    const functionName =
        get('--function-name') ||
        process.env['SF_FUNCTION_NAME'] ||
        `sf_smoke_${functionType}_${new Date()
            .toISOString()
            .replaceAll(/[^0-9]/g, '')
            .slice(0, 14)}`;

    if (!secretKey || !integrationId) {
        console.error('Missing required arguments.');
        printHelp();
        return null;
    }

    if (!skipRun && !connectionId) {
        console.error('Missing required --connection-id for /sf-run.');
        printHelp();
        return null;
    }

    if (skipDeploy && skipRun) {
        console.error('Cannot combine --skip-deploy and --skip-run.');
        printHelp();
        return null;
    }

    if (functionType !== 'action' && functionType !== 'sync') {
        console.error(`Invalid --function-type: ${functionType}`);
        printHelp();
        return null;
    }

    try {
        const parsed: Args = {
            host,
            secretKey,
            integrationId,
            connectionId,
            environment,
            functionType,
            functionName,
            skipDeploy,
            skipRun
        };

        const codeFile = get('--code-file');
        const testInput = parseJsonArg(get('--test-input'), '--test-input');
        const metadata = parseJsonArg(get('--metadata'), '--metadata');
        const checkpoint = parseJsonArg(get('--checkpoint'), '--checkpoint');
        const lastSyncDate = get('--last-sync-date');

        if (codeFile) {
            parsed.codeFile = codeFile;
        }
        if (testInput !== undefined) {
            parsed.testInput = testInput;
        }
        if (metadata !== undefined) {
            parsed.metadata = metadata;
        }
        if (checkpoint !== undefined) {
            parsed.checkpoint = checkpoint;
        }
        if (lastSyncDate) {
            parsed.lastSyncDate = lastSyncDate;
        }

        return parsed;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return null;
    }
}

function printHelp() {
    console.log(`
Smoke test for /sf-deploy and /sf-run.

Usage:
  npx tsx scripts/one-off/sf-endpoints-smoke.ts \\
    --secret-key sk_test_... \\
    --integration-id github \\
    --connection-id conn_123 \\
    --environment dev \\
    --function-type action

Required:
  --secret-key       Nango secret key (or NANGO_SECRET_KEY)
  --integration-id   Integration id / provider config key (or SF_INTEGRATION_ID)
  --connection-id    Connection id for /sf-run (or SF_CONNECTION_ID)

Optional:
  --host             API host (default: NANGO_HOSTPORT or http://localhost:3003)
  --environment      Environment name (default: SF_ENVIRONMENT or dev)
  --function-type    action|sync (default: action)
  --function-name    Function name to deploy/run (default: generated)
  --code-file        Path to TypeScript function file to deploy
  --test-input       JSON string for action input
  --metadata         JSON string for sync metadata
  --checkpoint       JSON string for sync checkpoint
  --last-sync-date   ISO timestamp for sync dry-run mode
  --skip-deploy      Only call /sf-run using latest deployed version
  --skip-run         Only call /sf-deploy to compile/deploy code
  --deploy-only      Alias for --skip-run

Examples:
  npx tsx scripts/one-off/sf-endpoints-smoke.ts --secret-key "$NANGO_SECRET_KEY" --integration-id github --connection-id demo --function-type action

  npx tsx scripts/one-off/sf-endpoints-smoke.ts --secret-key "$NANGO_SECRET_KEY" --integration-id github --function-type action --deploy-only

  npx tsx scripts/one-off/sf-endpoints-smoke.ts --secret-key "$NANGO_SECRET_KEY" --integration-id github --connection-id demo --function-type sync --metadata '{"tenant":"acme"}'
`);
}

void main();
