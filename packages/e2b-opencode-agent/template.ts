import { fileURLToPath } from 'node:url';

import { Template, waitForPort } from 'e2b';

import type { TemplateClass } from 'e2b';

export const agentTemplateName = process.env['E2B_AGENT_TEMPLATE'] || 'nango-opencode-agent';
export const agentProjectPath = '/home/user/nango-integrations';

const fileContextPath = fileURLToPath(new URL('../daytona-opencode-agent', import.meta.url));

export function createAgentTemplate(): TemplateClass {
    return Template({ fileContextPath })
        .fromNodeImage('24')
        .aptInstall(['curl', 'git', 'jq', 'openssh-server'])
        .npmInstall(['nango', 'opencode-ai'], { g: true })
        .runCmd(
            [
                'curl -fsSL -o /usr/local/bin/websocat https://github.com/vi/websocat/releases/latest/download/websocat.x86_64-unknown-linux-musl',
                'chmod a+x /usr/local/bin/websocat'
            ],
            { user: 'root' }
        )
        .runCmd([
            `mkdir -p ${agentProjectPath}`,
            `cd ${agentProjectPath} && nango init . --copy`,
            `cd ${agentProjectPath} && rm -rf github dist`,
            `cd ${agentProjectPath} && printf 'export {};\n' > index.ts`,
            `mkdir -p ${agentProjectPath}/.agents/skills`,
            `cd ${agentProjectPath} && npm install --no-audit --no-fund --no-progress`
        ])
        .copy('embedded-skills/nango-remote-function-builder', `${agentProjectPath}/.agents/skills/nango-remote-function-builder`)
        .setStartCmd(
            'sudo mkdir -p /var/run/sshd && sudo /usr/sbin/sshd && sudo websocat -b --exit-on-eof ws-l:0.0.0.0:8081 tcp:127.0.0.1:22',
            waitForPort(8081)
        );
}
