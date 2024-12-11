import type { Node, NodeProvider } from '@nangohq/fleet';
import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';
import { RenderAPI } from './render.api.js';
import { envs } from '../env.js';
import { getPersistAPIUrl, getProvidersUrl } from '@nangohq/shared';
import type { AxiosResponse } from 'axios';
import { isAxiosError } from 'axios';

const render: RenderAPI = new RenderAPI(envs.RENDER_API_KEY || '');

export const renderNodeProvider: NodeProvider = {
    defaultNodeConfig: {
        image: 'nangohq/nango-runner',
        cpuMilli: 500,
        memoryMb: 512,
        storageMb: 20000
    },
    start: async (node) => {
        if (!envs.RUNNER_OWNER_ID) {
            throw new Error('RUNNER_OWNER_ID is not set');
        }
        const ownerId = envs.RUNNER_OWNER_ID;
        const name = serviceName(node);
        const res = await withRateLimitHandling<{ service: { id: string; suspended: string } }>('create', () =>
            render.createService({
                type: 'private_service',
                name,
                ownerId,
                image: { ownerId, imagePath: node.image },
                serviceDetails: { env: 'image' },
                envVars: [
                    { key: 'NODE_ENV', value: envs.NODE_ENV },
                    { key: 'NANGO_CLOUD', value: String(envs.NANGO_CLOUD) },
                    { key: 'NODE_OPTIONS', value: `--max-old-space-size=${Math.floor((node.memoryMb / 4) * 3)}` },
                    { key: 'RUNNER_NODE_ID', value: `${node.id}` },
                    { key: 'RUNNER_URL', value: `http://${name}` },
                    { key: 'IDLE_MAX_DURATION_MS', value: `${25 * 60 * 60 * 1000}` }, // 25 hours
                    { key: 'PERSIST_SERVICE_URL', value: getPersistAPIUrl() },
                    { key: 'NANGO_TELEMETRY_SDK', value: process.env['NANGO_TELEMETRY_SDK'] || 'false' },
                    ...(envs.DD_ENV ? [{ key: 'DD_ENV', value: envs.DD_ENV }] : []),
                    ...(envs.DD_SITE ? [{ key: 'DD_SITE', value: envs.DD_SITE }] : []),
                    ...(envs.DD_TRACE_AGENT_URL ? [{ key: 'DD_TRACE_AGENT_URL', value: envs.DD_TRACE_AGENT_URL }] : []),
                    { key: 'JOBS_SERVICE_URL', value: envs.JOBS_SERVICE_URL },
                    { key: 'PROVIDERS_URL', value: getProvidersUrl() },
                    { key: 'PROVIDERS_RELOAD_INTERVAL', value: envs.PROVIDERS_RELOAD_INTERVAL.toString() }
                ]
            })
        );
        if (res.isErr()) {
            return Err(new Error('Failed to create service', { cause: res.error }));
        }
        if (!res.value.service) {
            return Err('Failed to create service, no service in response');
        }
        const svc = res.value.service;
        if (svc.suspended === 'suspended') {
            const res = await withRateLimitHandling('resume', () => render.resumeService({ serviceId: svc.id }));
            if (isAxiosError(res)) {
                return Err('Failed to render resume service');
            }
        }
        return Ok(undefined);
    },
    terminate: async (node) => {
        const serviceId = await getServiceId(node);
        if (serviceId.isErr()) {
            return Err(new Error('Failed to get service', { cause: serviceId.error }));
        }
        const res = await withRateLimitHandling('delete', () => render.deleteService({ serviceId: serviceId.value }));
        if (res.isErr()) {
            return Err(new Error('Failed to delete service', { cause: res.error }));
        }
        return Ok(undefined);
    },
    verifyUrl: (url) => {
        if (!url.match(/^http:\/\/(production|staging)-runner-account-(\d+|default)-\d+/)) {
            return Promise.resolve(Err('Invalid URL'));
        }
        return Promise.resolve(Ok(undefined));
    }
};

async function getServiceId(node: Node): Promise<Result<string>> {
    const res = await withRateLimitHandling<{ service: { id: string } }[]>('get', () =>
        render.getServices({ name: serviceName(node), type: 'private_service', limit: '1' })
    );
    if (res.isErr()) {
        return Err(new Error('Failed to get service', { cause: res.error }));
    }
    const svc = res.value[0];
    if (!svc) {
        return Err('Service not found');
    }
    return Ok(svc.service.id);
}

function serviceName(node: Node) {
    return `${node.routingId}-${node.id}`;
}

const rateLimitResetTimestamps = new Map<string, Date>();

async function withRateLimitHandling<T>(rateLimitGroup: 'create' | 'delete' | 'resume' | 'get', fn: () => Promise<AxiosResponse>): Promise<Result<T>> {
    const rateLimitReset = rateLimitResetTimestamps.get(rateLimitGroup);
    if (rateLimitReset && rateLimitReset > new Date()) {
        return Err(`Render rate limit exceeded. Resetting at ${rateLimitReset.toISOString()}`);
    }
    try {
        const res = await fn();
        return Ok(res.data);
    } catch (err) {
        if (isAxiosError(err)) {
            if (err.response?.status === 429) {
                let resetInMs = parseInt(err.response?.headers['ratelimit-reset']) * 1000;
                if (resetInMs <= 0) {
                    resetInMs = 10_000;
                }
                rateLimitResetTimestamps.set(rateLimitGroup, new Date(Date.now() + resetInMs));
            }
            return Err(`Request to Render API failed with status ${err.response?.status}: ${JSON.stringify(err.response?.data)}`);
        }
        return Err(new Error('Request to Render API failed', { cause: err }));
    }
}
