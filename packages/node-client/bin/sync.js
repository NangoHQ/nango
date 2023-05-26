import { Nango } from '../dist/index.js';
const nango = new Nango({ host: 'http://localhost:3003' });
const args = process.argv.slice(2);

nango
    .getRecords({
        providerConfigKey: args[0],
        connectionId: args[1],
        model: args[2],
        delta: args[3],
        offset: args[4],
        limit: args[5]
    })
    .then((response) => {
        console.log(response?.data);
    })
    .catch((err) => {
        console.log(err.response?.data || err.message);
    });
