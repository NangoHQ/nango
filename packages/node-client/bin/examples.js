import { Nango } from '../dist/index.js';
let nango = new Nango('localhost:3000');
nango
    .listConnections('hubspot', 1)
    .then((connections) => {
        console.log(connections);
    })
    .catch((err) => {
        console.log(err.message);
        console.log(err.response.data);
    });
