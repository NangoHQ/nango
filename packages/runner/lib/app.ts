import './tracer.js';
import { server } from './server.js';
import tracer from 'dd-trace';
import { telemetry } from '@nangohq/shared';

try {
    const port = parseInt(process.argv[2] || '') || 3006;
    const id = process.argv[3] || process.env['RUNNER_ID'] || 'unknown-id';
    server.listen(port, () => {
        console.log(`🚀 Runner '${id}' ready at http://localhost:${port}`);
    });
    tracer.dogstatsd.increment('test.runner1', 1);
    telemetry.increment('test.runner2' as any, 1);
} catch (err) {
    console.error(`Unable to start runner: ${err}`);
    process.exit(1);
}
