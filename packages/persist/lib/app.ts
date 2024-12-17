import './tracer.js';
import { getLogger } from '@nangohq/utils';
import { server } from './server.js';
import { envs } from './env.js';
import { getOtlpRoutes } from '@nangohq/shared';
import { otlp } from '@nangohq/logs';

const logger = getLogger('Persist');

try {
    const port = envs.NANGO_PERSIST_PORT;
    server.listen(port, () => {
        logger.info(`🚀 API ready at http://localhost:${port}`);
    });

    otlp.register(getOtlpRoutes);
} catch (err) {
    console.error(`Persist API error`, err);
    process.exit(1);
}
