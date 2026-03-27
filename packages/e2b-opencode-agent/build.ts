import 'dotenv/config';

import { Template, defaultBuildLogger } from 'e2b';

import { agentTemplateName, createAgentTemplate } from './template.js';

async function main() {
    await Template.build(createAgentTemplate(), agentTemplateName, {
        onBuildLogs: defaultBuildLogger()
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
