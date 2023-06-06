import { Nango } from '../dist/index.js';
const nango = new Nango({ host: 'http://localhost:3003' });
const args = process.argv.slice(2);

nango
    .listConnections(args[0])
    .then((response) => {
        console.log(response);
    })
    .catch((err) => {
        console.log(err.response?.data || err.message);
    });
