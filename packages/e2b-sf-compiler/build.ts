import 'dotenv/config';

import { Template, defaultBuildLogger } from 'e2b';

import { compilerTemplateName, createCompilerTemplate } from './template.js';

async function main() {
    await Template.build(createCompilerTemplate(), compilerTemplateName, {
        onBuildLogs: defaultBuildLogger()
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
