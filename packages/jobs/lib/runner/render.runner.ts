import type { Runner } from './runner.js';
import { RunnerType } from './runner.js';
import { ProxyAppRouter, getRunnerClient } from '@nangohq/nango-runner';
import { getEnv, getPersistAPIUrl } from '@nangohq/shared';
import api from 'api';
import tracer from '../tracer.js';

const render = api('@render-api/v1.0#aiie8wizhlp1is9bu');
render.auth(process.env['RENDER_API_KEY']);

const jobsServiceUrl = process.env['JOBS_SERVICE_URL'] || 'http://localhost:3005';

export class RenderRunner implements Runner {
    public client: ProxyAppRouter;
    public runnerType: RunnerType = RunnerType.Render;
    constructor(
        public readonly id: string,
        public readonly url: string,
        public readonly serviceId: string
    ) {
        this.client = getRunnerClient(this.url);
    }

    toJSON() {
        return { runnerType: this.runnerType, id: this.id, url: this.url, serviceId: this.serviceId };
    }

    static fromJSON(obj: { id: string; url: string; serviceId: string }): RenderRunner {
        return new RenderRunner(obj.id, obj.url, obj.serviceId);
    }

    async suspend(): Promise<void> {
        const span = tracer.startSpan('runner.suspend').setTag('serviceId', this.serviceId).setTag('runnerId', this.id);
        try {
            await render.suspendService({ serviceId: this.serviceId });
        } finally {
            span.finish();
        }
    }

    static async get(runnerId: string): Promise<RenderRunner | undefined> {
        let svc = null;
        const res = await render.getServices({ name: runnerId, type: 'private_service', limit: '1' });
        if (res.data.length > 0) {
            svc = res.data[0].service;
            return new RenderRunner(runnerId, `http://${runnerId}`, svc.id);
        }
        return undefined;
    }

    static async getOrStart(runnerId: string): Promise<RenderRunner> {
        try {
            let svc = null;
            // check if runner exists, if not, create it
            let res = await render.getServices({ name: runnerId, type: 'private_service', limit: '1' });
            if (res.data.length > 0) {
                svc = res.data[0].service;
            } else {
                const imageTag = getEnv();
                const ownerId = process.env['RUNNER_OWNER_ID'];
                if (!ownerId) {
                    throw new Error('RUNNER_OWNER_ID is not set');
                }
                res = await render.createService({
                    type: 'private_service',
                    name: runnerId,
                    ownerId: ownerId,
                    image: { ownerId: ownerId, imagePath: `nangohq/nango-runner:${imageTag}` },
                    serviceDetails: { env: 'image' },
                    envVars: [
                        { key: 'NODE_ENV', value: process.env['NODE_ENV'] },
                        { key: 'NANGO_CLOUD', value: process.env['NANGO_CLOUD'] },
                        { key: 'NODE_OPTIONS', value: '--max-old-space-size=384' },
                        { key: 'RUNNER_ID', value: runnerId },
                        { key: 'NOTIFY_IDLE_ENDPOINT', value: `${jobsServiceUrl}/idle` },
                        { key: 'IDLE_MAX_DURATION_MS', value: `${25 * 60 * 60 * 1000}` }, // 25 hours
                        { key: 'PERSIST_SERVICE_URL', value: getPersistAPIUrl() }
                    ]
                });
                svc = res.data.service;
            }
            if (!svc) {
                throw new Error(`Unable to get/create runner instance ${runnerId}`);
            }
            // check if runner is suspended, if so, resume it
            if (svc.suspended === 'suspended') {
                const span = tracer.startSpan('runner.resume').setTag('serviceId', svc.id).setTag('runnerId', runnerId);
                try {
                    await render.resumeService({ serviceId: svc.id });
                } finally {
                    span.finish();
                }
            }
            return new RenderRunner(runnerId, `http://${runnerId}`, svc.id);
        } catch (err) {
            throw new Error(`Unable to get runner ${runnerId}: ${err}`);
        }
    }
}
