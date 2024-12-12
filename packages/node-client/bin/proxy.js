import { Nango } from '../dist/index.js';
const args = process.argv.slice(2);

const nango = new Nango({ host: 'http://localhost:3003', secretKey: args[0] });

nango
    .proxy({
        providerConfigKey: args[1],
        connectionId: args[2],
        method: args[3],
        endpoint: args[4],
        retries: 3,
        data: {
            summary: 'TEST',
            description: 'TEST DATA'
        }
    })
    .then((response) => {
        console.log(response?.data);
    })
    .catch((err: unknown) => {
        console.log(err.response?.data || err.message);
    });
