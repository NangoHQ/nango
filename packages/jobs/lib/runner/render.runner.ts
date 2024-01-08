import type { Runner } from './runner.js';
import { getRunnerClient } from '@nangohq/nango-runner';
import { getEnv } from '@nangohq/shared';
import api from 'api';

const render = api('@render-api/v1.0#aiie8wizhlp1is9bu');
render.auth(process.env['RENDER_API_KEY']);

export class RenderRunner implements Runner {
    constructor(public readonly id: string, public readonly client: any, private readonly serviceId: string) {}

    async stop(): Promise<void> {
        render.suspendService({ serviceId: this.serviceId });
    }

    static async get(runnerId: string): Promise<RenderRunner> {
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
                        { key: 'NANGO_DB_HOST', value: process.env['NANGO_DB_HOST'] },
                        { key: 'NANGO_DB_NAME', value: process.env['NANGO_DB_NAME'] },
                        { key: 'NANGO_DB_PASSWORD', value: process.env['NANGO_DB_PASSWORD'] },
                        { key: 'NANGO_DB_PORT', value: process.env['NANGO_DB_PORT'] },
                        { key: 'NANGO_DB_SSL', value: process.env['NANGO_DB_SSL'] },
                        { key: 'NANGO_ENCRYPTION_KEY', value: process.env['NANGO_ENCRYPTION_KEY'] },
                        { key: 'NODE_OPTIONS', value: '--max-old-space-size=384' }
                    ]
                });
                svc = res.data.service;
            }
            if (!svc) {
                throw new Error(`Unable to create runner instance ${runnerId}`);
            }
            // check if runner is suspended, if so, resume it
            if (svc.suspended === 'suspended') {
                const res = await render.resumeService({ serviceId: svc.id });
                console.log(res);
            }
            const client = getRunnerClient(`http://${runnerId}`);
            return new RenderRunner(runnerId, client, svc.id);
        } catch (err) {
            throw new Error(`Unable to get runner ${runnerId}: ${err}`);
        }
    }
}
