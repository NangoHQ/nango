import { Nango } from '../dist/index.js';
const args = process.argv.slice(2);
const nango = new Nango({ secret: args[0], host: 'http://localhost:3003' });

const metadata = {
    fieldMapping: {
        slack_channel_id: 'Slack_ID__c',
        primary_support_rep: 'Primary_Support_Rep__c',
        secondary_support_rep: 'Secondary_Support_Rep__c'
    }
};

nango.setMatadata(metadata, args[1], args[2]).then((response) => {
    console.log(response?.data);
});

nango
    .getMetadata(args[1], args[2])
    .then((response) => {
        console.log(response);
    })
    .catch((err) => {
        console.log(err.response?.data || err.message);
    });
