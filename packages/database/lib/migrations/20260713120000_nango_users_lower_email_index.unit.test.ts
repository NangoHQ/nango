import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const migration = require('./20260713120000_nango_users_lower_email_index.cjs');

function mockKnex(hasConflicts: boolean) {
    const raw = vi.fn((sql: string) =>
        sql.includes('has_conflicts') ? Promise.resolve({ rows: [{ has_conflicts: hasConflicts }] }) : Promise.resolve({ rows: [] })
    );
    return { knex: { raw }, raw };
}

function indexStatements(raw: ReturnType<typeof vi.fn>): string[] {
    return raw.mock.calls.map((call) => call[0] as string).filter((sql) => sql.includes('idx_nango_users_email_lower'));
}

describe('migration: nango_users lower(email) index', () => {
    it('creates a UNIQUE index when there are no case-insensitive duplicates', async () => {
        const { knex, raw } = mockKnex(false);

        await migration.up(knex);

        const statements = indexStatements(raw);
        expect(statements).toHaveLength(1);
        expect(statements[0]).toContain('CREATE UNIQUE INDEX');
    });

    it('skips index creation without throwing when duplicates exist', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { knex, raw } = mockKnex(true);

        await migration.up(knex);

        expect(indexStatements(raw)).toHaveLength(0);
        expect(warn).toHaveBeenCalled();

        warn.mockRestore();
    });
});
