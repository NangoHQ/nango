import './tracer.js';
import { getLogger } from '@nangohq/utils';
import { server } from './server.js';
import { db } from '@nangohq/shared';
import { envs } from './env.js';

const logger = getLogger('Persist');

try {
    const port = envs.NANGO_PERSIST_PORT;
    server.listen(port, () => {
        logger.info(`🚀 API ready at http://localhost:${port}`);

        db.enableMetrics();
    });
} catch (err) {
    console.error(`Persist API error: ${err}`);
    process.exit(1);
}
