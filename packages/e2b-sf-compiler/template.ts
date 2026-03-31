import { Template, waitForPort } from 'e2b';

import type { TemplateClass } from 'e2b';

export const compilerTemplateName = process.env['E2B_COMPILER_TEMPLATE'] || 'nango-sf-compiler';
export const compilerProjectPath = '/home/user/nango-integrations';

export function createCompilerTemplate(): TemplateClass {
    return Template()
        .fromNodeImage('24')
        .aptInstall(['curl', 'git', 'jq', 'openssh-server'])
        .npmInstall('nango', { g: true })
        .runCmd(
            [
                'curl -fsSL -o /usr/local/bin/websocat https://github.com/vi/websocat/releases/latest/download/websocat.x86_64-unknown-linux-musl',
                'chmod a+x /usr/local/bin/websocat'
            ],
            { user: 'root' }
        )
        .runCmd([
            `mkdir -p ${compilerProjectPath}`,
            `cd ${compilerProjectPath} && nango init . --copy`,
            `cd ${compilerProjectPath} && rm -rf github dist`,
            `cd ${compilerProjectPath} && printf 'export {};\n' > index.ts`,
            `cd ${compilerProjectPath} && npm install --no-audit --no-fund --no-progress`
        ])
        .setStartCmd(
            'sudo mkdir -p /var/run/sshd && sudo /usr/sbin/sshd && sudo websocat -b --exit-on-eof ws-l:0.0.0.0:8081 tcp:127.0.0.1:22',
            waitForPort(8081)
        );
}
