import { describe, expect, it } from 'vitest';

import { hasImport } from './integrationFiles.js';

describe('hasImport', () => {
    it('matches a single-quoted import', () => {
        expect(hasImport(`import './github/actions/list-repos.js';`, './github/actions/list-repos.js')).toBe(true);
    });

    it('matches a double-quoted import', () => {
        expect(hasImport(`import "./github/actions/list-repos.js";`, './github/actions/list-repos.js')).toBe(true);
    });

    it('matches when the import is preceded by whitespace', () => {
        expect(hasImport(`    import './github/actions/list-repos.js';`, './github/actions/list-repos.js')).toBe(true);
    });

    it('matches when the import is on a non-first line', () => {
        const content = `import 'other.js';\nimport './github/actions/list-repos.js';\n`;
        expect(hasImport(content, './github/actions/list-repos.js')).toBe(true);
    });

    it('returns false when the path appears only inside a string literal', () => {
        expect(hasImport(`const path = './github/actions/list-repos.js';`, './github/actions/list-repos.js')).toBe(false);
    });

    it('returns false when the path appears only inside a comment', () => {
        expect(hasImport(`// import './github/actions/list-repos.js';`, './github/actions/list-repos.js')).toBe(false);
    });

    it('returns false when the path is a substring of a different imported path', () => {
        // existing import is for list-repos-v2, lookup is for list-repos
        expect(hasImport(`import './github/actions/list-repos-v2.js';`, './github/actions/list-repos.js')).toBe(false);
    });

    it('returns false on empty content', () => {
        expect(hasImport('', './github/actions/list-repos.js')).toBe(false);
    });

    it('returns false when the import is for a different path', () => {
        expect(hasImport(`import './github/actions/other.js';`, './github/actions/list-repos.js')).toBe(false);
    });

    it('escapes regex metacharacters in the import path', () => {
        // dots in the path should match literally, not as regex wildcards
        const content = `import './a.b/c.js';`;
        expect(hasImport(content, './a.b/c.js')).toBe(true);
        // confirm the dot is not treated as a wildcard
        expect(hasImport(content, './aXb/c.js')).toBe(false);
    });
});
