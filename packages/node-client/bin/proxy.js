import { Nango } from '../dist/index.js';
const nango = new Nango({ host: 'http://localhost:3003' });
const args = process.argv.slice(2);

nango.proxy({
    providerConfigKey: args[0],
    connectionId: args[1]
});
