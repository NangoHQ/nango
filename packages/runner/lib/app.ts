import './tracer.js';
import type { AddressInfo } from 'node:net';
import { server } from './server.js';
import { getLogger } from '@nangohq/utils';

const logger = getLogger('Runner');
const SERVER_RUN_MODE = process.env['SERVER_RUN_MODE'];

try {
    const port = parseInt(process.argv[2] || '') || 3006;
    const id = process.argv[3] || process.env['RUNNER_ID'] || 'unknown-id';
    const tmp = server.listen(port, SERVER_RUN_MODE === 'DOCKERIZED' ? '0.0.0.0' : 'localhost', () => {
        const addr = tmp.address() as AddressInfo;
        logger.info(`🚀 '${id}' ready at ${addr?.address}:${addr?.port}`);
    });
} catch (err) {
    logger.error(`Unable to start runner: ${JSON.stringify(err)}`);
    process.exit(1);
}
