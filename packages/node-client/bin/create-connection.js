import { Nango } from '../dist/index.js';
const nango = new Nango({ host: 'http://localhost:3003' });
const args = process.argv.slice(2);

// oauth 1
/*
nango
    .createConnection({
        provider_config_key: args[0],
        connection_id: args[1],
        type: 'OAUTH1',
        oauth_token: args[2],
        oauth_token_secret: args[3],
        raw: args[4]
    })
    .then((response) => {
        console.log(response?.data);
    })
    .catch((err) => {
        console.log(err.response?.data || err.message);
    });
*/

// oauth 2
nango
    .createConnection({
        provider_config_key: args[1],
        connection_id: args[0],
        type: 'OAUTH2',
        access_token: args[2],
        refresh_token: args[3],
        expires_in: args[4],
        expires_at: args[5],
        raw: args[6]
    })
    .then((response) => {
        console.log(response?.data);
    })
    .catch((err) => {
        console.log(err.response?.data || err.message);
    });
