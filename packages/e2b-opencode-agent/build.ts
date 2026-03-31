import 'dotenv/config';

import { Template, defaultBuildLogger } from 'e2b';

import { agentTemplateName, createAgentTemplate } from './template.js';

async function main() {
    await Template.build(createAgentTemplate(), agentTemplateName, {
        cpuCount: 4,
        memoryMB: 2048,
        onBuildLogs: defaultBuildLogger()
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
