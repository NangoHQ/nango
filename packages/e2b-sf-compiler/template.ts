import { Template } from 'e2b';

import type { TemplateClass } from 'e2b';

export const compilerTemplateName = process.env['E2B_COMPILER_TEMPLATE'] || 'nango-sf-compiler';
export const compilerProjectPath = '/home/user/nango-integrations';

export function createCompilerTemplate(): TemplateClass {
    return Template()
        .fromNodeImage('24')
        .aptInstall(['curl', 'git', 'jq'])
        .npmInstall('nango', { g: true })
        .runCmd([
            `mkdir -p ${compilerProjectPath}`,
            `cd ${compilerProjectPath} && nango init . --copy`,
            `cd ${compilerProjectPath} && rm -rf github dist`,
            `cd ${compilerProjectPath} && printf 'export {};\n' > index.ts`,
            `cd ${compilerProjectPath} && npm install --no-audit --no-fund --no-progress`
        ]);
}
