import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import Fastify from 'fastify';

import createApp from '../fastify.js';

const app = Fastify();
await createApp(app);

await app.ready();

if (app.swagger === null || app.swagger === undefined) {
    console.error(app);
    throw new Error('@fastify/swagger plugin is not loaded');
}

const schema = JSON.stringify(app.swagger(), null, 4);
// const schema = JSON.stringify(app.swagger(), undefined, 2); for pretty print
await writeFile(path.join(import.meta.dirname, '..', '..', 'openapi.json'), schema, { flag: 'w+' });

await app.close();

process.exit(0);
