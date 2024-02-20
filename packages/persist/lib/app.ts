import './tracer.js';
import { server } from './server.js';

try {
    const port = parseInt(process.env['NANGO_PERSIST_PORT'] || '') || 3007;
    server.listen(port, () => {
        console.log(`🚀 Persist API ready at http://localhost:${port}`);
    });
} catch (err) {
    console.error(`Persist API error: ${err}`);
    process.exit(1);
}
