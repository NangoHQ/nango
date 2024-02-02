import { Nango } from '../dist/index.js';
import fs from 'fs';
const args = process.argv.slice(2);

const nango = new Nango({ host: 'http://localhost:3003', secretKey: args[0] });

const pdf = fs.readFileSync('./test.pdf', 'utf8');
const formData = new FormData();
formData.append('content', pdf);

console.log(formData);

nango
    .proxy({
        providerConfigKey: 'unauthenticated',
        connectionId: 'u',
        baseUrlOverride: 'http://localhost:3009',
        method: 'POST',
        endpoint: '/',
        data: formData,
        headers: {
            'Content-Type': 'multipart/form-data',
            'Nango-Proxy-Content-Type': 'multipart/form-data'
        }
    })
    .then((response) => {
        console.log(response?.data);
    })
    .catch((err) => {
        console.log(err.response?.data || err.message);
    });
