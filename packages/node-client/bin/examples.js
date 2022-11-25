import { Pizzly } from '../dist/index.js';

let pizzly = new Pizzly();
let creds = await pizzly.auth(1, 'hubspot');

console.log(creds);
