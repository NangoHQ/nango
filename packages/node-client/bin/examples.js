import { Pizzly } from '../dist/index.js';

let pizzly = new Pizzly('http://localhost:3003');
pizzly
    .accessToken('hubspot', 1)
    .then((creds) => {
        console.log(creds);
    })
    .catch((err) => {
        console.log(err.message);
        console.log(err.response.data);
    });
