import { Nango } from '../dist/index.js';
import fs from 'fs';
const args = process.argv.slice(2);

const nango = new Nango({ host: 'http://localhost:3003', secretKey: args[0] });

const filePath = './test.pdf';
const fileName = filePath.split('/').pop();
const buffer = fs.readFileSync(filePath);

nango
    .proxy({
        providerConfigKey: 'unauthenticated',
        connectionId: 'u',
        baseUrlOverride: 'http://localhost:3009',
        method: 'POST',
        endpoint: '/upload/octet-stream',
        data: buffer,
        headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Name': fileName
        }
    })
    .then((response) => {
        console.log(response?.data);
    })
    .catch((err: unknown) => {
        console.log(err.response?.data || err.message);
    });
