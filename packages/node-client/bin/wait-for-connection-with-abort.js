import { Nango } from '../dist/index.js';
const args = process.argv.slice(2);

const nango = new Nango({ host: 'http://localhost:3003', secretKey: args[0] });

// Create an AbortController to cancel the wait after 10 seconds
const controller = new AbortController();

// Set up a timeout to abort after 10 seconds
const abortTimeout = setTimeout(() => {
    console.log('Aborting wait after 20 seconds...');
    controller.abort();
}, 20000);

nango
    .waitForConnection(args[0], args[1], { signal: controller.signal })
    .then((response) => {
        clearTimeout(abortTimeout);
        console.log('Connection found!');
        console.log(response);
    })
    .catch((err) => {
        clearTimeout(abortTimeout);
        if (err.message === 'Wait for connection was aborted') {
            console.log('Wait was cancelled after 10 seconds');
        } else {
            console.log(err.response?.data || err.message);
        }
    });
