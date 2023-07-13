import { Nango } from '../dist/index.js';
const args = process.argv.slice(2);
const nango = new Nango({ host: 'http://localhost:3003', secretKey: args[0] });

nango
    .getRecords({
        providerConfigKey: args[1],
        connectionId: args[2],
        model: args[3]
    })
    .then((response) => {
        console.log(response);
    })
    .catch((err) => {
        console.log(err.response?.data || err.message);
    });
