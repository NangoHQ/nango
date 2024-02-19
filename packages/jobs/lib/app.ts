import './tracer.js';
import { Temporal } from './temporal.js';
import { server } from './server.js';
import { cronAutoIdleDemo } from './crons/autoIdleDemo.js';

try {
    const port = parseInt(process.env['NANGO_JOBS_PORT'] || '') || 3005;
    server.listen(port);
    console.log(`🚀 Jobs service ready at http://localhost:${port}`);
    const temporalNs = process.env['TEMPORAL_NAMESPACE'] || 'default';
    const temporal = new Temporal(temporalNs);
    temporal.start();

    // Register recurring tasks
    cronAutoIdleDemo();

    // handle SIGTERM
    process.on('SIGTERM', async () => {
        temporal.stop();
        server.server.close(async () => {
            process.exit(0);
        });
    });
} catch (err) {
    console.error(`[JOBS]: ${err}`);
    process.exit(1);
}
