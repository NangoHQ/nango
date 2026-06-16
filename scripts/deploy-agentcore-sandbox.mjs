#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const runtimeName = requiredEnv('AGENTCORE_RUNTIME_NAME');
const imageUri = requiredEnv('AGENTCORE_RUNTIME_IMAGE_URI');
const configuredRuntimeId = optionalEnv('AGENTCORE_RUNTIME_ID');
const configuredRoleArn = optionalEnv('AGENTCORE_RUNTIME_ROLE_ARN');

const createDescription = optionalEnv('AGENTCORE_RUNTIME_DESCRIPTION') || `Nango AgentCore sandbox runtime ${runtimeName}`;
const waitTimeoutSeconds = Number(optionalEnv('AGENTCORE_RUNTIME_WAIT_TIMEOUT_SECONDS') || 900);
const waitIntervalSeconds = Number(optionalEnv('AGENTCORE_RUNTIME_WAIT_INTERVAL_SECONDS') || 10);

const configuredNetworkConfiguration = optionalJsonEnv('AGENTCORE_RUNTIME_NETWORK_CONFIGURATION');
const configuredProtocolConfiguration = optionalJsonEnv('AGENTCORE_RUNTIME_PROTOCOL_CONFIGURATION');
const configuredAuthorizerConfiguration = optionalJsonEnv('AGENTCORE_RUNTIME_AUTHORIZER_CONFIGURATION');
const configuredRequestHeaderConfiguration = optionalJsonEnv('AGENTCORE_RUNTIME_REQUEST_HEADER_CONFIGURATION');
const configuredLifecycleConfiguration = optionalJsonEnv('AGENTCORE_RUNTIME_LIFECYCLE_CONFIGURATION');
const configuredMetadataConfiguration = optionalJsonEnv('AGENTCORE_RUNTIME_METADATA_CONFIGURATION');
const configuredEnvironmentVariables = optionalJsonEnv('AGENTCORE_RUNTIME_ENVIRONMENT_VARIABLES');
const configuredFilesystemConfigurations = optionalJsonEnv('AGENTCORE_RUNTIME_FILESYSTEM_CONFIGURATIONS');
const configuredTags = optionalJsonEnv('AGENTCORE_RUNTIME_TAGS');

const defaultNetworkConfiguration = { networkMode: 'PUBLIC' };
const defaultProtocolConfiguration = { serverProtocol: 'HTTP' };

const runtime = await findRuntime();
const finalRuntime = runtime ? await updateRuntime(runtime) : await createRuntime();

writeGithubOutput({
    agent_runtime_arn: finalRuntime.agentRuntimeArn,
    agent_runtime_id: finalRuntime.agentRuntimeId,
    agent_runtime_version: finalRuntime.agentRuntimeVersion,
    agent_runtime_status: finalRuntime.status
});

console.log(
    `AgentCore runtime ${finalRuntime.agentRuntimeName} (${finalRuntime.agentRuntimeId}) is ${finalRuntime.status} on version ${finalRuntime.agentRuntimeVersion}`
);
console.log(`AgentCore runtime ARN: ${finalRuntime.agentRuntimeArn}`);
console.log(`AgentCore runtime image: ${imageUri}`);

async function findRuntime() {
    if (configuredRuntimeId) {
        const byId = getRuntime(configuredRuntimeId, { allowNotFound: true });
        if (!byId) {
            throw new Error(`AGENTCORE_RUNTIME_ID is set to ${configuredRuntimeId}, but that runtime was not found`);
        }

        if (byId.agentRuntimeName !== runtimeName) {
            throw new Error(`AGENTCORE_RUNTIME_ID ${configuredRuntimeId} is named ${byId.agentRuntimeName}, expected AGENTCORE_RUNTIME_NAME ${runtimeName}`);
        }

        return byId;
    }

    const listed = awsJson(['bedrock-agentcore-control', 'list-agent-runtimes']);
    const matches = (listed.agentRuntimes || []).filter((candidate) => candidate.agentRuntimeName === runtimeName);
    if (matches.length > 1) {
        throw new Error(`Found multiple AgentCore runtimes named ${runtimeName}; set AGENTCORE_RUNTIME_ID explicitly`);
    }
    if (matches.length === 0) {
        return null;
    }

    return getRuntime(matches[0].agentRuntimeId);
}

async function createRuntime() {
    if (!configuredRoleArn) {
        throw new Error('AGENTCORE_RUNTIME_ROLE_ARN is required when creating a missing AgentCore runtime');
    }

    const input = compact({
        agentRuntimeName: runtimeName,
        agentRuntimeArtifact: agentRuntimeArtifact(),
        roleArn: configuredRoleArn,
        networkConfiguration: stripCreateUnsupportedNetworkFields(configuredNetworkConfiguration || defaultNetworkConfiguration),
        protocolConfiguration: configuredProtocolConfiguration || defaultProtocolConfiguration,
        description: createDescription,
        authorizerConfiguration: configuredAuthorizerConfiguration,
        requestHeaderConfiguration: configuredRequestHeaderConfiguration,
        lifecycleConfiguration: configuredLifecycleConfiguration,
        metadataConfiguration: configuredMetadataConfiguration,
        environmentVariables: configuredEnvironmentVariables,
        filesystemConfigurations: configuredFilesystemConfigurations,
        tags: configuredTags,
        clientToken: clientToken('create')
    });

    console.log(`Creating AgentCore runtime ${runtimeName}`);
    const created = awsJsonWithInput(['bedrock-agentcore-control', 'create-agent-runtime'], input);
    return await waitForReady(created.agentRuntimeId);
}

async function updateRuntime(runtime) {
    runtime = await waitForStable(runtime);

    if (runtime.agentRuntimeArtifact?.containerConfiguration?.containerUri === imageUri && runtime.status === 'READY') {
        console.log(`AgentCore runtime ${runtime.agentRuntimeName} already uses ${imageUri}`);
        return runtime;
    }

    const input = compact({
        agentRuntimeId: runtime.agentRuntimeId,
        agentRuntimeArtifact: agentRuntimeArtifact(),
        roleArn: configuredRoleArn || runtime.roleArn,
        networkConfiguration: configuredNetworkConfiguration || runtime.networkConfiguration,
        protocolConfiguration: configuredProtocolConfiguration || runtime.protocolConfiguration || defaultProtocolConfiguration,
        description: runtime.description || createDescription,
        authorizerConfiguration: configuredAuthorizerConfiguration || runtime.authorizerConfiguration,
        requestHeaderConfiguration: configuredRequestHeaderConfiguration || runtime.requestHeaderConfiguration,
        lifecycleConfiguration: configuredLifecycleConfiguration || runtime.lifecycleConfiguration,
        metadataConfiguration: configuredMetadataConfiguration || runtime.metadataConfiguration,
        environmentVariables: configuredEnvironmentVariables || runtime.environmentVariables,
        filesystemConfigurations: configuredFilesystemConfigurations || runtime.filesystemConfigurations,
        clientToken: clientToken('update')
    });

    console.log(`Updating AgentCore runtime ${runtime.agentRuntimeName} to ${imageUri}`);
    const updated = awsJsonWithInput(['bedrock-agentcore-control', 'update-agent-runtime'], input);
    return await waitForReady(updated.agentRuntimeId);
}

function agentRuntimeArtifact() {
    return {
        containerConfiguration: {
            containerUri: imageUri
        }
    };
}

async function waitForStable(runtime) {
    if (runtime.status === 'CREATING' || runtime.status === 'UPDATING') {
        return await waitForReady(runtime.agentRuntimeId);
    }
    if (runtime.status === 'CREATE_FAILED' || runtime.status === 'UPDATE_FAILED' || runtime.status === 'DELETING') {
        throw failedRuntimeError(runtime);
    }

    return runtime;
}

async function waitForReady(runtimeId) {
    const deadline = Date.now() + waitTimeoutSeconds * 1000;
    let runtime = getRuntime(runtimeId);

    while (runtime.status === 'CREATING' || runtime.status === 'UPDATING') {
        if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for AgentCore runtime ${runtimeId} to become READY; last status was ${runtime.status}`);
        }
        console.log(`Waiting for AgentCore runtime ${runtimeId}; current status is ${runtime.status}`);
        await sleep(waitIntervalSeconds * 1000);
        runtime = getRuntime(runtimeId);
    }

    if (runtime.status !== 'READY') {
        throw failedRuntimeError(runtime);
    }

    return runtime;
}

function failedRuntimeError(runtime) {
    const suffix = runtime.failureReason ? `: ${runtime.failureReason}` : '';
    return new Error(`AgentCore runtime ${runtime.agentRuntimeId} is ${runtime.status}${suffix}`);
}

function getRuntime(runtimeId, options = {}) {
    const result = awsJson(['bedrock-agentcore-control', 'get-agent-runtime', '--agent-runtime-id', runtimeId], options.allowNotFound);
    return result || null;
}

function awsJson(args, allowNotFound = false) {
    const result = spawnSync('aws', [...args, '--output', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });

    if (result.error) {
        throw new Error(`Failed to run aws: ${result.error.message}`);
    }
    if (allowNotFound && result.status !== 0 && result.stderr.includes('ResourceNotFoundException')) {
        return null;
    }
    if (result.status !== 0) {
        throw new Error(`aws ${args.join(' ')} failed\n${result.stderr || result.stdout}`);
    }
    if (!result.stdout.trim()) {
        return {};
    }

    return JSON.parse(result.stdout);
}

function awsJsonWithInput(args, input) {
    const dir = mkdtempSync(join(tmpdir(), 'nango-agentcore-'));
    const file = join(dir, 'input.json');
    try {
        writeFileSync(file, `${JSON.stringify(input, null, 2)}\n`);
        return awsJson([...args, '--cli-input-json', `file://${file}`]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function clientToken(operation) {
    const hash = createHash('sha256').update(`${operation}:${runtimeName}:${imageUri}`).digest('hex');
    return `nango-agentcore-${operation}-${hash}`;
}

function stripCreateUnsupportedNetworkFields(networkConfiguration) {
    const copy = structuredClone(networkConfiguration);
    if (copy.networkModeConfig) {
        delete copy.networkModeConfig.requireServiceS3Endpoint;
    }
    return copy;
}

function optionalJsonEnv(name) {
    const value = optionalEnv(name);
    if (!value) {
        return undefined;
    }

    try {
        return JSON.parse(value);
    } catch (err) {
        throw new Error(`${name} must be valid JSON`, { cause: err });
    }
}

function optionalEnv(name) {
    const value = process.env[name];
    return value && value.trim() ? value.trim() : undefined;
}

function requiredEnv(name) {
    const value = optionalEnv(name);
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

function compact(value) {
    if (Array.isArray(value)) {
        const compacted = value.map(compact).filter((item) => item !== undefined);
        return compacted.length > 0 ? compacted : undefined;
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value)
            .map(([key, entryValue]) => [key, compact(entryValue)])
            .filter(([, entryValue]) => entryValue !== undefined);
        if (entries.length === 0) {
            return undefined;
        }
        return Object.fromEntries(entries);
    }
    if (value === null || value === undefined || value === '') {
        return undefined;
    }
    return value;
}

function writeGithubOutput(outputs) {
    const outputPath = process.env.GITHUB_OUTPUT;
    if (!outputPath) {
        return;
    }

    const lines = Object.entries(outputs)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${value}`);
    writeFileSync(outputPath, `${lines.join('\n')}\n`, { flag: 'a' });
}
