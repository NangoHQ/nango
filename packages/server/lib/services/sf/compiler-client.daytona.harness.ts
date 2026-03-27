export const daytonaCompilerHarness = String.raw`
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = '/home/daytona/nango-integrations';
const compileModuleUrl = pathToFileURL(path.join(projectRoot, 'node_modules/nango/dist/zeroYaml/compile.js')).href;
const definitionsModuleUrl = pathToFileURL(path.join(projectRoot, 'node_modules/nango/dist/zeroYaml/definitions.js')).href;

const { compileAllFunctions } = await import(compileModuleUrl);
const { parseIntegrationDefinitions } = await import(definitionsModuleUrl);

function output(payload) {
    process.stdout.write(JSON.stringify(payload));
}

function succeed(payload) {
    output({ success: true, bundledJs: payload.bundledJs, flow: payload.flow });
    process.exit(0);
}

function fail(step, message, stack) {
    const payload = { success: false, step, message: typeof message === 'string' ? message.trim() : message };
    if (stack) {
        payload.stack = stack;
    }
    output(payload);
    process.exit(1);
}

function validateString(value, field, pattern, maxLength) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error('Invalid request: ' + field + ' must be a non-empty string');
    }
    if (value.length > maxLength) {
        throw new Error('Invalid request: ' + field + ' exceeds max length ' + String(maxLength));
    }
    if (pattern && !pattern.test(value)) {
        throw new Error('Invalid request: ' + field + ' has invalid format');
    }
    return value;
}

function validateRequest(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('Invalid request: body must be an object');
    }

    const integrationPattern = /^[a-zA-Z0-9~:.@ _-]+$/;
    const functionPattern = /^[a-zA-Z0-9_-]+$/;
    const functionType = body.function_type;
    if (functionType !== 'action' && functionType !== 'sync') {
        throw new Error('Invalid request: function_type must be action or sync');
    }

    return {
        integration_id: validateString(body.integration_id, 'integration_id', integrationPattern, 255),
        function_name: validateString(body.function_name, 'function_name', functionPattern, 255),
        function_type: functionType,
        code: validateString(body.code, 'code', null, 1000000)
    };
}

function errorToText(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return JSON.stringify(error);
}

async function captureConsole(fn) {
    const lines = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const capture = (...args) => {
        lines.push(args.map((arg) => (typeof arg === 'string' ? arg : errorToText(arg))).join(' '));
    };

    console.log = capture;
    console.error = capture;
    console.warn = capture;

    try {
        const result = await fn();
        return { result, lines };
    } finally {
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
    }
}

function buildMetadata(definition) {
    const metadata = {};
    if (definition.description) {
        metadata.description = definition.description;
    }
    if (definition.scopes) {
        metadata.scopes = definition.scopes;
    }
    return metadata;
}

async function main() {
    const requestPath = process.argv[2];
    if (!requestPath) {
        fail('validation', 'Missing compile request path');
    }

    const rawRequest = await fs.readFile(requestPath, 'utf8');
    const body = validateRequest(JSON.parse(rawRequest));
    const functionFolder = body.function_type === 'sync' ? 'syncs' : 'actions';
    const integrationDir = path.join(projectRoot, body.integration_id);
    const sourcePath = path.join(integrationDir, functionFolder, body.function_name + '.ts');
    const indexPath = path.join(projectRoot, 'index.ts');
    const buildPath = path.join(projectRoot, 'build');
    const bundledPath = path.join(buildPath, body.integration_id + '_' + functionFolder + '_' + body.function_name + '.cjs');

    await fs.rm(integrationDir, { recursive: true, force: true });
    await fs.rm(buildPath, { recursive: true, force: true });
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, body.code, 'utf8');
    await fs.writeFile(indexPath, "import './" + body.integration_id + '/' + functionFolder + '/' + body.function_name + ".js';\n", 'utf8');

    const compileOutcome = await captureConsole(async () => {
        return await compileAllFunctions({ fullPath: projectRoot, debug: false, interactive: false });
    });
    if (compileOutcome.result.isErr()) {
        fail('compilation', compileOutcome.lines.join('\n') || errorToText(compileOutcome.result.error));
    }

    const definitionOutcome = await captureConsole(async () => {
        return await parseIntegrationDefinitions({ fullPath: projectRoot, debug: false });
    });
    if (definitionOutcome.result.isErr()) {
        fail('compilation', definitionOutcome.lines.join('\n') || errorToText(definitionOutcome.result.error));
    }

    const parsed = definitionOutcome.result.value;
    const integration = parsed.integrations.find((candidate) => candidate.providerConfigKey === body.integration_id);
    if (!integration) {
        fail('compilation', 'Compiled integration not found: ' + body.integration_id);
    }

    const bundledJs = await fs.readFile(bundledPath, 'utf8');

    if (body.function_type === 'sync') {
        const sync = integration.syncs.find((candidate) => candidate.name === body.function_name);
        if (!sync) {
            fail('compilation', 'Compiled sync not found: ' + body.function_name);
        }

        succeed({
            bundledJs,
            flow: {
                syncName: sync.name,
                providerConfigKey: integration.providerConfigKey,
                models: sync.output || [],
                version: sync.version,
                runs: sync.runs,
                track_deletes: sync.track_deletes,
                auto_start: sync.auto_start,
                attributes: {},
                metadata: buildMetadata(sync),
                input: sync.input || undefined,
                sync_type: sync.sync_type,
                type: sync.type,
                fileBody: { js: bundledJs, ts: body.code },
                endpoints: sync.endpoints,
                webhookSubscriptions: sync.webhookSubscriptions,
                models_json_schema: sync.json_schema,
                features: sync.features
            }
        });
    }

    const action = integration.actions.find((candidate) => candidate.name === body.function_name);
    if (!action) {
        fail('compilation', 'Compiled action not found: ' + body.function_name);
    }

    succeed({
        bundledJs,
        flow: {
            syncName: action.name,
            providerConfigKey: integration.providerConfigKey,
            models: action.output || [],
            version: action.version,
            runs: null,
            metadata: buildMetadata(action),
            input: action.input || undefined,
            type: action.type,
            fileBody: { js: bundledJs, ts: body.code },
            endpoints: action.endpoint ? [action.endpoint] : [],
            track_deletes: false,
            models_json_schema: action.json_schema,
            features: action.features
        }
    });
}

try {
    await main();
} catch (error) {
    fail('compilation', errorToText(error), error instanceof Error ? error.stack : undefined);
}
`;
