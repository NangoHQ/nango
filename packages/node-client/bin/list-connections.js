import { Nango } from '../dist/index.js';
const args = process.argv.slice(2);

const nango = new Nango({ host: 'http://localhost:3003', secretKey: args[0] });

nango
    .listConnections({ integrationId: args[1] })
    .then((response) => {
        console.log(JSON.stringify(response));
    })
    .catch((err) => {
        console.log(err.response?.data || err.message);
    });
