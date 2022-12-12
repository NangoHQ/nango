import { Pizzly } from '../dist/index.js';

let pizzly = new Pizzly('http://localhost:3004', '36a49164-c5d5-4df2-995a-0d2dfa07e406');
pizzly
    .accessToken('trello', 123)
    .then((creds) => {
        console.log(creds);
    })
    .catch((err) => {
        console.log(err.message);
        console.log(err.response.data);
    });
