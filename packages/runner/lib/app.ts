import './tracer.js';
import { server } from './server.js';
import Logger from '@nangohq/internals/dist/logger.js';

const { logger } = new Logger('Runner');

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
