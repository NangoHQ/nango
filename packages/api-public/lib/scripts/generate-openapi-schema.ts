import { writeFile } from 'node:fs/promises';

import Fastify from 'fastify';

import createApp from '../fastify.js';

const app = Fastify();
await app.register(createApp);

await app.ready();

if (app.swagger === null || app.swagger === undefined) {
    console.error(app);
    throw new Error('@fastify/swagger plugin is not loaded');
}

const schema = JSON.stringify(app.swagger());
// const schema = JSON.stringify(app.swagger(), undefined, 2); for pretty print
await writeFile('doc/openapi.json', schema, { flag: 'w+' });

await app.close();
