import './tracer.js';
import { server } from './server.js';

try {
    const port = parseInt(process.argv[2] || '') || 3006;
    const id = process.argv[3] || process.env['RUNNER_ID'] || 'unknown-id';
    server.listen(port, () => {
        console.log(`🚀 Runner '${id}' ready at http://localhost:${port}`);
    });
} catch (err) {
    console.error(`Unable to start runner: ${err}`);
    process.exit(1);
}
