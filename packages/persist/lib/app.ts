import './tracer.js';
import { getLogger } from '@nangohq/utils';
import { server } from './server.js';

const logger = getLogger('Persist');

try {
    const port = parseInt(process.env['NANGO_PERSIST_PORT'] || '') || 3007;
    server.listen(port, () => {
        logger.info(`🚀 API ready at http://localhost:${port}`);
    });
} catch (err) {
    console.error(`Persist API error: ${err}`);
    process.exit(1);
}
