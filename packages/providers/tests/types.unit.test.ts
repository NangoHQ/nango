import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { loadProvidersYaml } from '../lib/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const providerTypesPath = path.join(repoRoot, 'packages/types/lib/providers/provider.js');

/**
 * GET /providers returns providers.yaml as is (aliases resolved), typed as `Provider` from @nangohq/types.
 * Customers validate that response against the published types, so every provider must satisfy `Provider`.
 * This compiles each entry with `satisfies Provider`, which catches wrong value types, missing required
 * fields and unknown keys.
 */
describe('providers.yaml', () => {
    it('matches the Provider type', () => {
        const providers = loadProvidersYaml();
        expect(providers).toBeDefined();

        const names = Object.keys(providers!);
        const source = [
            `import type { Provider } from ${JSON.stringify(providerTypesPath)};`,
            ...names.map((name, i) => `export const p${i} = ${JSON.stringify(providers![name])} satisfies Provider;`)
        ].join('\n');

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nango-provider-types-'));
        const file = path.join(dir, 'providers.check.ts');
        try {
            fs.writeFileSync(file, source);
            const program = ts.createProgram([file], {
                strict: true,
                exactOptionalPropertyTypes: true,
                noEmit: true,
                skipLibCheck: true,
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.NodeNext,
                moduleResolution: ts.ModuleResolutionKind.NodeNext,
                typeRoots: [path.join(repoRoot, 'node_modules/@types')],
                types: ['node']
            });

            const errors = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
                const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
                if (diagnostic.file?.fileName !== file || diagnostic.start === undefined) {
                    return message;
                }
                // Line 0 is the import, so line N is provider N - 1.
                const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                return `${names[line - 1]}: ${message}`;
            });

            expect(errors).toEqual([]);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
