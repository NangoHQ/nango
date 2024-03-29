import './tracer.js';
import { Temporal } from './temporal.js';
import { server } from './server.js';
import { cronAutoIdleDemo } from './crons/autoIdleDemo.js';
import { deleteOldActivityLogs } from './crons/deleteOldActivities.js';
import { deleteSyncsData } from './crons/deleteSyncsData.js';
import { getLogger } from '@nangohq/utils/dist/logger.js';

const logger = getLogger('Jobs');

try {
    const port = parseInt(process.env['NANGO_JOBS_PORT'] || '') || 3005;
    server.listen(port);
    logger.info(`🚀 service ready at http://localhost:${port}`);
    const temporalNs = process.env['TEMPORAL_NAMESPACE'] || 'default';
    const temporal = new Temporal(temporalNs);

    // This promise never resolve
    void temporal.start();

    // Register recurring tasks
    cronAutoIdleDemo();
    deleteOldActivityLogs();
    deleteSyncsData();

    // handle SIGTERM
    process.on('SIGTERM', () => {
        temporal.stop();
        server.server.close(() => {
            process.exit(0);
        });
    });
} catch (err) {
    logger.error(`${JSON.stringify(err)}`);
    process.exit(1);
}
