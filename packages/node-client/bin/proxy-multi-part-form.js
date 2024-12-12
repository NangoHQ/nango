import { Nango } from '../dist/index.js';
import fs from 'fs';
const args = process.argv.slice(2);

const nango = new Nango({ host: 'http://localhost:3003', secretKey: args[0] });

const filePath = './test.pdf';
const fileName = filePath.split('/').pop();
const buffer = fs.readFileSync(filePath);
const formData = new FormData();
formData.append('file', new Blob([buffer]), fileName);

nango
    .proxy({
        providerConfigKey: 'unauthenticated',
        connectionId: 'u',
        baseUrlOverride: 'http://localhost:3009',
        method: 'POST',
        endpoint: '/upload/multipart',
        data: formData,
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    })
    .then((response) => {
        console.log(response?.data);
    })
    .catch((err: unknown) => {
        console.log(err.response?.data || err.message);
    });
