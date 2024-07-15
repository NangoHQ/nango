import './tracer.js';
import { Processor } from './processor/processor.js';
import { server } from './server.js';
import { cronAutoIdleDemo } from './crons/autoIdleDemo.js';
import { deleteSyncsData } from './crons/deleteSyncsData.js';
import { getLogger, stringifyError } from '@nangohq/utils';
import { timeoutLogsOperations } from './crons/timeoutLogsOperations.js';
import { envs } from './env.js';

const logger = getLogger('Jobs');

try {
    const port = envs.NANGO_JOBS_PORT;
    const orchestratorUrl = envs.ORCHESTRATOR_SERVICE_URL;
    server.listen(port);
    logger.info(`🚀 service ready at http://localhost:${port}`);
    const processor = new Processor(orchestratorUrl);

    processor.start();

    // Register recurring tasks
    cronAutoIdleDemo();
    deleteSyncsData({ orchestratorUrl });
    timeoutLogsOperations();

    // handle SIGTERM
    process.on('SIGTERM', () => {
        processor.stop();
        server.server.close(() => {
            process.exit(0);
        });
    });
} catch (err) {
    logger.error(stringifyError(err));
    process.exit(1);
}
