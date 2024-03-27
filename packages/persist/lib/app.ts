import './tracer.js';
import Logger from '@nangohq/utils/dist/logger.js';
import { server } from './server.js';

const { logger } = new Logger('Persist');

try {
    const port = parseInt(process.env['NANGO_PERSIST_PORT'] || '') || 3007;
    server.listen(port, () => {
        logger.info(`🚀 API ready at http://localhost:${port}`);
    });
} catch (err) {
    console.error(`Persist API error: ${err}`);
    process.exit(1);
}
