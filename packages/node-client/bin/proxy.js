import { Nango } from '../dist/index.js';
const nango = new Nango({ host: 'http://localhost:3003' });
const args = process.argv.slice(2);

nango
    .proxy({
        providerConfigKey: args[0],
        connectionId: args[1],
        method: args[2],
        endpoint: args[3],
        retries: 3,
        data: {
            summary: 'TEST',
            description: 'TEST DATA'
        }
    })
    .then((response) => {
        console.log(response?.data);
    })
    .catch((err) => {
        console.log(err.response?.data || err.message);
    });
