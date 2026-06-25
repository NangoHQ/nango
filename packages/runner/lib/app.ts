import './tracer.js';

import { monitorProviders } from '@nangohq/shared';
import { stringifyError } from '@nangohq/utils';

import { envs } from './env.js';
import { logger } from './logger.js';
import { register } from './register.js';
import { server } from './server.js';

const providersMonitorCleanup = await monitorProviders();

try {
    const port = parseInt(process.argv[2] || '') || 3006;
    const id = process.argv[3] || envs.RUNNER_NODE_ID;
    const srv = server.listen(port, async () => {
        logger.info(`🏃‍♀️ '${id}' ready at http://localhost:${port}`);

        const res = await register();
        if (res.isErr()) {
            logger.error(`${id} Unable to register`, res.error);
        }
    });
    // keepAliveTimeout must exceed the fronting proxy/load balancer idle timeout (e.g. AWS ALB defaults to 60s) so the
    // proxy closes idle connections first. Node's 5s default closes pooled sockets the proxy still considers reusable,
    // causing the next request to hit a dead socket -> TCP RST -> 502. Mirrors packages/server/lib/server.ts.
    srv.keepAliveTimeout = envs.NANGO_SERVER_KEEP_ALIVE_TIMEOUT;
    srv.headersTimeout = envs.NANGO_SERVER_KEEP_ALIVE_TIMEOUT + 1000; // needs to be longer than the keep alive timeout to avoid premature disconnections

    const close = () => {
        logger.info(`${id} Closing...`);
        providersMonitorCleanup();

        srv.close(() => {
            process.exit();
        });
    };

    process.on('SIGINT', () => {
        logger.info(`${id} Received SIGINT...`);
        close();
    });

    process.on('SIGTERM', () => {
        logger.info(`${id} Received SIGTERM...`);
        close();
    });

    process.on('unhandledRejection', (reason) => {
        logger.error(`${id} Received uncaughtException...`, reason);
        // not closing on purpose
    });

    process.on('uncaughtException', (e) => {
        logger.error(`${id} Received uncaughtException...`, e);
        // not closing on purpose
    });
} catch (err) {
    logger.error(`Unable to start runner: ${stringifyError(err)}`);
    process.exit(1);
}
