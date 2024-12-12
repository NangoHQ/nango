import { Nango } from '../dist/index.js';
let nango = new Nango({ host: 'http://localhost:3003' });
nango
    .getConnection('github-dev', 2)
    .then((connections) => {
        console.log(connections);
    })
    .catch((err: unknown) => {
        console.log(err.response?.data || err.message);
    });
