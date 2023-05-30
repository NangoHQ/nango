import { Nango } from '../dist/index.js';
const nango = new Nango({ host: 'http://localhost:3003' });
const args = process.argv.slice(2);

const fieldMapping = {
    slack_channel_id: 'Slack_ID__c',
    primary_support_rep: 'Primary_Support_Rep__c',
    secondary_support_rep: 'Secondary_Support_Rep__c'
};

nango.setFieldMapping(fieldMapping, args[0], args[1]).then((response) => {
    console.log(response?.data);
});

nango
    .getFieldMapping(args[0], args[1])
    .then((response) => {
        console.log(response);
    })
    .catch((err) => {
        console.log(err.response?.data || err.message);
    });
