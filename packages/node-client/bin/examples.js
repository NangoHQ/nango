import { Nango } from '../dist/index.js';
const secretKey = '679de721-795a-4ecf-ba16-52a4f630a43f';
let nango = new Nango({ host: 'http://localhost:3003', secretKey });
//nango
//.getConnection('github-dev', 2)
//.then((connections) => {
//console.log(connections);
//})
//.catch((err: unknown) => {
//console.log(err.response?.data || err.message);
//});
nango.getScriptsConfig('openai').then((config) => {
    console.log(config);
});
