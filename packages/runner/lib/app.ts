import './tracer.js';
import { server } from './server.js';
import { logger } from '@nangohq/shared';

try {
    const port = parseInt(process.argv[2] || '') || 3006;
    const id = process.argv[3] || process.env['RUNNER_ID'] || 'unknown-id';
    server.listen(port, () => {
        logger.info(`🚀 Runner '${id}' ready at http://localhost:${port}`);
    });
} catch (err) {
    logger.error(`Unable to start runner: ${JSON.stringify(err)}`);
    process.exit(1);
}
