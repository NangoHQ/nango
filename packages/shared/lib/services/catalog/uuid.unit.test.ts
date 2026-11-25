import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { generateCatalogFunctionUuid, isCatalogFunctionUuid } from './uuid.js';

const uuid = 'ca7a10c0-9582-8b46-8c47-f39eee45f2b3';

describe('generateCatalogFunctionUuid', () => {
    it('uses a stable, versioned identity encoding', () => {
        expect(generateCatalogFunctionUuid({ provider: 'github', name: 'get_issue' })).toBe(uuid);
        expect(generateCatalogFunctionUuid({ provider: 'github', name: 'get_issue' })).toBe(uuid);
    });

    it('produces valid UUIDv8 identities with the reserved prefix', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 1000; i++) {
            const id = generateCatalogFunctionUuid({ provider: `provider-${i % 10}`, name: `function-${i}` });
            expect(isCatalogFunctionUuid(id)).toBe(true);
            expect(z.uuid({ version: 'v8' }).safeParse(id).success).toBe(true);
            ids.add(id);
        }
        expect(ids.size).toBe(1000);
    });

    it('distinguishes providers and public names', () => {
        expect(generateCatalogFunctionUuid({ provider: 'gitlab', name: 'get_issue' })).not.toBe(uuid);
        expect(generateCatalogFunctionUuid({ provider: 'github', name: 'list_issues' })).not.toBe(uuid);
    });

    it.each([
        { provider: '', name: 'get_issue' },
        { provider: 'github', name: '' }
    ])('rejects empty identity components: %j', (identity) => {
        expect(() => generateCatalogFunctionUuid(identity)).toThrow('Catalog function UUID generation requires a provider and name');
    });
});

describe('isCatalogFunctionUuid', () => {
    it('accepts lowercase UUIDs only', () => {
        expect(isCatalogFunctionUuid(uuid)).toBe(true);
    });

    it.each([
        uuid.toUpperCase(),
        undefined,
        null,
        123,
        {},
        '',
        'ca7a10c0',
        '11111111-1111-4111-8111-111111111111',
        'ca7a10c0-9582-4b46-8c47-f39eee45f2b3',
        'ca7a10c0-9582-8b46-7c47-f39eee45f2b3',
        'ca7a10c1-9582-8b46-8c47-f39eee45f2b3',
        'ca7a10c0-9582-8b46-8c47-f39eee45f2bg',
        `${uuid}0`,
        `${uuid}\n`,
        ` ${uuid}`
    ])('rejects values outside the reserved UUIDv8 format: %j', (value) => {
        expect(isCatalogFunctionUuid(value)).toBe(false);
    });
});
