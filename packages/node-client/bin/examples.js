import { Pizzly } from '../dist/index.js';

let pizzly = new Pizzly();
let creds = await pizzly.accessToken(1, 'hubspot');

console.log(creds);
