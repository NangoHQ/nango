import './tracer.js';
import { Temporal } from './temporal.js';
import { server } from './server.js';
import { cronAutoIdleDemo } from './crons/autoIdleDemo.js';
import { deleteOldActivityLogs } from './crons/deleteOldActivities.js';
import { deleteSyncsData } from './crons/deleteSyncsData.js';
import { getLogger, stringifyError } from '@nangohq/utils';
import { JOBS_PORT } from './constants.js';
import { cronDeleteOldLogs } from './crons/deleteOldLogs.js';

const logger = getLogger('Jobs');

try {
    server.listen(JOBS_PORT);
    logger.info(`🚀 service ready at http://localhost:${JOBS_PORT}`);
    const temporalNs = process.env['TEMPORAL_NAMESPACE'] || 'default';
    const temporal = new Temporal(temporalNs);

    // This promise never resolve
    void temporal.start();

    // Register recurring tasks
    cronAutoIdleDemo();
    deleteOldActivityLogs();
    deleteSyncsData();
    cronDeleteOldLogs();

    // handle SIGTERM
    process.on('SIGTERM', () => {
        temporal.stop();
        server.server.close(() => {
            process.exit(0);
        });
    });
} catch (err) {
    logger.error(stringifyError(err));
    process.exit(1);
}
