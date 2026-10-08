import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const generator = fileURLToPath(new URL('./docs-generate-llms.ts', import.meta.url));

function generateDocs(newline: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nango-llms-'));
    try {
        fs.mkdirSync(path.join(root, 'docs', 'api-integrations'), { recursive: true });
        fs.mkdirSync(path.join(root, 'packages', 'providers'), { recursive: true });
        fs.writeFileSync(
            path.join(root, 'docs', 'docs.json'),
            JSON.stringify({
                navigation: {
                    tabs: [
                        { tab: 'Documentation', groups: [{ group: 'Guides', pages: ['connect-ui'] }] },
                        {
                            tab: 'APIs & Integrations',
                            groups: [
                                { group: 'Overview', pages: ['overview'] },
                                { group: 'APIs & Integrations', pages: ['api-integrations/xendit'] }
                            ]
                        }
                    ]
                }
            })
        );
        const page = [
            '---',
            'title: Connect UI with MCP API and CI/CD',
            'description: Keep the canonical title and this useful summary.',
            '---',
            "import Hidden from './hidden.mdx';",
            '',
            '## Guide body',
            '',
            'Keep this content.',
            '',
            '```javascript',
            'import keepInsideFence from "example";',
            '```',
            ''
        ].join(newline);
        fs.writeFileSync(path.join(root, 'docs', 'connect-ui.mdx'), page);
        fs.writeFileSync(path.join(root, 'docs', 'overview.mdx'), ['---', 'title: API overview', '---', 'Overview body.'].join(newline));
        fs.writeFileSync(path.join(root, 'docs', 'api-integrations', 'xendit.mdx'), 'Xendit provider body.');
        fs.writeFileSync(path.join(root, 'packages', 'providers', 'providers.yaml'), 'xendit:\n  display_name: Xendit\n  auth_mode: BASIC\n');

        execFileSync(process.execPath, ['--import', import.meta.resolve('tsx'), generator], { cwd: root });

        return {
            compact: fs.readFileSync(path.join(root, 'docs', 'llms.txt'), 'utf8'),
            full: fs.readFileSync(path.join(root, 'docs', 'llms-full.txt'), 'utf8'),
            catalog: fs.readFileSync(path.join(root, 'docs', 'api-catalog.txt'), 'utf8')
        };
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

describe('generated LLM docs indexes', () => {
    it.each([
        ['LF', '\n'],
        ['CRLF', '\r\n']
    ])('preserves frontmatter metadata and strips MDX boilerplate with %s files', (_name, newline) => {
        const { compact, full, catalog } = generateDocs(newline);

        expect(compact).toContain(
            '- [Connect UI with MCP API and CI/CD](https://nango.dev/docs/connect-ui.md): Keep the canonical title and this useful summary.'
        );
        expect(full).toContain('## Connect UI with MCP API and CI/CD');
        expect(full).toContain('Description: Keep the canonical title and this useful summary.');
        expect(full).toContain('Keep this content.');
        expect(full).toContain('import keepInsideFence from "example";');
        expect(full).not.toContain('title: Connect');
        expect(full).not.toContain("import Hidden from './hidden.mdx'");
        expect(catalog).toContain('`xendit`');
    });

    it('generates identical indexes from LF and CRLF source files', () => {
        expect(generateDocs('\r\n')).toEqual(generateDocs('\n'));
    });
});
