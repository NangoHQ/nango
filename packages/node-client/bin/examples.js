import { Nango } from '../dist/index.js';

let nango = new Nango('http://localhost:3003');
nango
    .getToken('hubspot', 1)
    .then((creds) => {
        console.log(creds);
    })
    .catch((err) => {
        console.log(err.message);
        console.log(err.response.data);
    });
