import './tracer.js';
import { Temporal } from './temporal.js';
import { server } from './server.js';
import { cronAutoIdleDemo } from './crons/autoIdleDemo.js';
import { deleteOldActivityLogs } from './crons/deleteOldActivities.js';
import { deleteSyncsData } from './crons/deleteSyncsData.js';
import { reconcileTemporalSchedules } from './crons/reconcileTemporalSchedules.js';
import { getLogger, stringifyError } from '@nangohq/utils';
import { JOBS_PORT } from './constants.js';
import { db } from '@nangohq/shared';
import { timeoutLogsOperations } from './crons/timeoutLogsOperations.js';

const logger = getLogger('Jobs');

try {
    server.listen(JOBS_PORT);
    logger.info(`🚀 service ready at http://localhost:${JOBS_PORT}`);
    const temporalNs = process.env['TEMPORAL_NAMESPACE'] || 'default';
    const temporal = new Temporal(temporalNs);

    // This promise never resolve
    void temporal.start();

    db.enableMetrics();

    // Register recurring tasks
    cronAutoIdleDemo();
    deleteOldActivityLogs();
    deleteSyncsData();
    reconcileTemporalSchedules();
    timeoutLogsOperations();

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
