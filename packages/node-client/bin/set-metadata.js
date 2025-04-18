import { Nango } from '../dist/index.js';
const args = process.argv.slice(2);
const nango = new Nango({ host: 'http://localhost:3003', secretKey: args[0] });

const metadata = {
    customFields: ['Question__c', 'Answer__c']
};

await nango.setMetadata(args[1], args[2], metadata).then((response) => {
    console.log(response?.data);
});

await nango
    .getMetadata(args[1], args[2])
    .then((response) => {
        console.log(response);
    })
    .catch((err: unknown) => {
        console.log(err.response?.data || err.message);
    });
