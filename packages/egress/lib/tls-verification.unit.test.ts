import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packagesDir = fileURLToPath(new URL('../../', import.meta.url));

const ALLOWED = new Set([
    'cli/lib/utils.ts',
    'database/lib/getConfig.ts',
    'orchestrator/lib/app.ts',
    'records/lib/stores/postgres/config.ts',
    'server/lib/auditDb.ts',
    'tasks/lib/tasks.ts'
]);

const DISABLES_TLS_VERIFICATION = [/rejectUnauthorized\s*:\s*false/, /NODE_TLS_REJECT_UNAUTHORIZED/];

function sourceFiles(): string[] {
    const files: string[] = [];
    for (const pkg of fs.readdirSync(packagesDir)) {
        const libDir = path.join(packagesDir, pkg, 'lib');
        if (!fs.existsSync(libDir)) {
            continue;
        }
        for (const entry of fs.readdirSync(libDir, { recursive: true, encoding: 'utf8' })) {
            if (entry.includes('node_modules') || !/\.(ts|tsx|js|mjs|cjs)$/.test(entry) || /\.test\.|\.spec\./.test(entry)) {
                continue;
            }
            files.push(path.join(pkg, 'lib', entry));
        }
    }
    return files;
}

describe('TLS verification', () => {
    it('is never disabled outside the allowed database and CLI configs', () => {
        const files = sourceFiles();
        expect(files.length).toBeGreaterThan(100);

        const offenders = files.filter((file) => {
            if (ALLOWED.has(file.split(path.sep).join('/'))) {
                return false;
            }
            const source = fs.readFileSync(path.join(packagesDir, file), 'utf8');
            return DISABLES_TLS_VERIFICATION.some((pattern) => pattern.test(source));
        });

        expect(offenders).toStrictEqual([]);
    });

    it('only allows files that still need it', () => {
        for (const file of ALLOWED) {
            const source = fs.readFileSync(path.join(packagesDir, file), 'utf8');
            expect(DISABLES_TLS_VERIFICATION.some((pattern) => pattern.test(source))).toBe(true);
        }
    });
});
