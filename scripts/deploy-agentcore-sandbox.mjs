#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const runtimeName = requiredEnv('AGENTCORE_RUNTIME_NAME');
const imageUri = requiredEnv('AGENTCORE_RUNTIME_IMAGE_URI');
const runtimeRoleArn = requiredEnv('AGENTCORE_RUNTIME_ROLE_ARN');

const runtimeDescription = `Nango AgentCore sandbox runtime ${runtimeName}`;
const waitTimeoutMs = 900_000;
const waitIntervalMs = 10_000;

const defaultNetworkConfiguration = { networkMode: 'PUBLIC' };
const defaultProtocolConfiguration = { serverProtocol: 'HTTP' };
const runtimeArtifact = {
    containerConfiguration: {
        containerUri: imageUri
    }
};

const runtime = findRuntime();
const finalRuntime = runtime ? await updateRuntime(runtime) : await createRuntime();

console.log(
    `AgentCore runtime ${finalRuntime.agentRuntimeName} (${finalRuntime.agentRuntimeId}) is ${finalRuntime.status} on version ${finalRuntime.agentRuntimeVersion}`
);
console.log(`AgentCore runtime ARN: ${finalRuntime.agentRuntimeArn}`);
console.log(`AgentCore runtime image: ${imageUri}`);

function findRuntime() {
    const listed = agentCoreControl(['list-agent-runtimes']);
    const matches = (listed.agentRuntimes || []).filter((candidate) => candidate.agentRuntimeName === runtimeName);
    if (matches.length > 1) {
        throw new Error(`Found multiple AgentCore runtimes named ${runtimeName}; remove the duplicate runtime before deploying`);
    }
    if (matches.length === 0) {
        return null;
    }

    return getRuntime(matches[0].agentRuntimeId);
}

async function createRuntime() {
    const input = {
        agentRuntimeName: runtimeName,
        agentRuntimeArtifact: runtimeArtifact,
        roleArn: runtimeRoleArn,
        networkConfiguration: defaultNetworkConfiguration,
        protocolConfiguration: defaultProtocolConfiguration,
        description: runtimeDescription
    };

    console.log(`Creating AgentCore runtime ${runtimeName}`);
    const created = agentCoreControl(['create-agent-runtime'], input);
    return await waitForReady(created.agentRuntimeId);
}

async function updateRuntime(runtime) {
    runtime = await waitForStable(runtime);

    const input = {
        agentRuntimeId: runtime.agentRuntimeId,
        agentRuntimeArtifact: runtimeArtifact,
        roleArn: runtimeRoleArn,
        networkConfiguration: defaultNetworkConfiguration,
        protocolConfiguration: defaultProtocolConfiguration,
        description: runtimeDescription
    };

    console.log(`Updating AgentCore runtime ${runtime.agentRuntimeName} to ${imageUri}`);
    const updated = agentCoreControl(['update-agent-runtime'], input);
    return await waitForReady(updated.agentRuntimeId);
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
    const deadline = Date.now() + waitTimeoutMs;
    let runtime = getRuntime(runtimeId);

    while (runtime.status === 'CREATING' || runtime.status === 'UPDATING') {
        if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for AgentCore runtime ${runtimeId} to become READY; last status was ${runtime.status}`);
        }
        console.log(`Waiting for AgentCore runtime ${runtimeId}; current status is ${runtime.status}`);
        await sleep(waitIntervalMs);
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

function getRuntime(runtimeId) {
    return agentCoreControl(['get-agent-runtime', '--agent-runtime-id', runtimeId]);
}

function agentCoreControl(args, input) {
    const command = ['bedrock-agentcore-control', ...args, ...(input ? ['--cli-input-json', JSON.stringify(input)] : [])];
    const result = spawnSync('aws', [...command, '--output', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });

    if (result.error) {
        throw new Error(`Failed to run aws: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`aws ${command.join(' ')} failed\n${result.stderr || result.stdout}`);
    }
    if (!result.stdout.trim()) {
        return {};
    }

    return JSON.parse(result.stdout);
}

function requiredEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}
