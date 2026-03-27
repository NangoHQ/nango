import { fileURLToPath } from 'node:url';

import { Template } from 'e2b';

import type { TemplateClass } from 'e2b';

export const agentTemplateName = process.env['E2B_AGENT_TEMPLATE'] || 'nango-opencode-agent';
export const agentProjectPath = '/home/user/nango-integrations';

const fileContextPath = fileURLToPath(new URL('../daytona-opencode-agent', import.meta.url));

export function createAgentTemplate(): TemplateClass {
    return Template({ fileContextPath })
        .fromNodeImage('24')
        .aptInstall(['curl', 'git', 'jq'])
        .npmInstall(['nango', 'opencode-ai'], { g: true })
        .runCmd([
            `mkdir -p ${agentProjectPath}`,
            `cd ${agentProjectPath} && nango init . --copy`,
            `cd ${agentProjectPath} && rm -rf github dist`,
            `cd ${agentProjectPath} && printf 'export {};\n' > index.ts`,
            `mkdir -p ${agentProjectPath}/.agents/skills`,
            `cd ${agentProjectPath} && npm install --no-audit --no-fund --no-progress`
        ])
        .copy('embedded-skills/nango-remote-function-builder', `${agentProjectPath}/.agents/skills/nango-remote-function-builder`);
}
