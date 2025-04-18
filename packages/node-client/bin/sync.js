import { Nango } from '../dist/index.js';
const nango = new Nango({ host: 'http://localhost:3003' });
const args = process.argv.slice(2);

nango
    .listRecords({
        providerConfigKey: args[0],
        connectionId: args[1],
        model: args[2],
        delta: args[3],
        limit: args[4]
    })
    .then((response) => {
        console.log(response?.data);
    })
    .catch((err: unknown) => {
        console.log(err.response?.data || err.message);
    });
