import './tracer.js';
import { server } from './server.js';
import { getLogger } from '@nangohq/utils/dist/logger.js';

const logger = getLogger('Runner');

try {
    const port = parseInt(process.argv[2] || '') || 3006;
    const id = process.argv[3] || process.env['RUNNER_ID'] || 'unknown-id';
    server.listen(port, () => {
        logger.info(`🚀 '${id}' ready at http://localhost:${port}`);
    });
} catch (err) {
    logger.error(`Unable to start runner: ${JSON.stringify(err)}`);
    process.exit(1);
}
