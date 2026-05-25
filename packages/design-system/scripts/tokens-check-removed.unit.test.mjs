import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkRemovedTokens, extractDefinedVars, findRemovedVars, findUsages, getMatchingLines, getSearchPatterns, reportUsages } from './tokens-check-removed.mjs';

// ─── extractDefinedVars ────────────────────────────────────────────────────────

describe('extractDefinedVars', () => {
    it('extracts simple variable definitions', () => {
        const css = `:root {\n  --surface-canvas: #fff;\n  --text-strong: #000;\n}`;
        const vars = extractDefinedVars(css);
        expect(vars.has('--surface-canvas')).toBe(true);
        expect(vars.has('--text-strong')).toBe(true);
    });

    it('does not match var() references', () => {
        const css = `a { color: var(--text-strong); }`;
        const vars = extractDefinedVars(css);
        expect(vars.size).toBe(0);
    });

    it('handles whitespace before the colon', () => {
        const css = `  --some-token  : value;`;
        const vars = extractDefinedVars(css);
        expect(vars.has('--some-token')).toBe(true);
    });

    it('returns an empty set for CSS with no definitions', () => {
        expect(extractDefinedVars('body { color: red; }').size).toBe(0);
    });
});

// ─── findRemovedVars ───────────────────────────────────────────────────────────

describe('findRemovedVars', () => {
    const makeCss = (...vars) => vars.map((v) => `${v}: value;`).join('\n');

    it('returns vars present in old but absent in new', () => {
        const old = makeCss('--surface-canvas', '--text-strong');
        const next = makeCss('--surface-canvas');
        expect(findRemovedVars(old, next)).toEqual(['--text-strong']);
    });

    it('returns empty array when no vars are removed', () => {
        const css = makeCss('--surface-canvas', '--text-strong');
        expect(findRemovedVars(css, css)).toEqual([]);
    });

    it('ignores --color-* vars (Tailwind @theme aliases)', () => {
        const old = makeCss('--surface-canvas', '--color-surface-canvas');
        const next = makeCss('--surface-canvas-new');
        // --color-surface-canvas is removed but should be skipped
        const removed = findRemovedVars(old, next);
        expect(removed).not.toContain('--color-surface-canvas');
        expect(removed).toContain('--surface-canvas');
    });

    it('handles completely empty new CSS', () => {
        const old = makeCss('--surface-canvas');
        expect(findRemovedVars(old, '')).toEqual(['--surface-canvas']);
    });
});

// ─── getSearchPatterns ─────────────────────────────────────────────────────────

describe('getSearchPatterns', () => {
    it('always includes var() reference', () => {
        const patterns = getSearchPatterns('--surface-canvas');
        expect(patterns).toContain('var(--surface-canvas)');
    });

    it('includes Tailwind utility patterns for semantic tokens', () => {
        const patterns = getSearchPatterns('--surface-canvas');
        expect(patterns).toContain('bg-surface-canvas');
        expect(patterns).toContain('text-surface-canvas');
        expect(patterns).toContain('border-surface-canvas');
        expect(patterns).toContain('fill-surface-canvas');
        expect(patterns).toContain('stroke-surface-canvas');
        expect(patterns).toContain('ring-surface-canvas');
        expect(patterns).toContain('from-surface-canvas');
        expect(patterns).toContain('via-surface-canvas');
        expect(patterns).toContain('to-surface-canvas');
    });

    it('does NOT include Tailwind patterns for --ds-* primitive tokens', () => {
        const patterns = getSearchPatterns('--ds-color-neutral-50');
        expect(patterns).toEqual(['var(--ds-color-neutral-50)']);
    });

    it('includes exactly var() for a --ds-* token (no Tailwind patterns)', () => {
        const patterns = getSearchPatterns('--ds-typography-font-size-md');
        expect(patterns.length).toBe(1);
        expect(patterns[0]).toBe('var(--ds-typography-font-size-md)');
    });
});

// ─── getMatchingLines ──────────────────────────────────────────────────────────

describe('getMatchingLines', () => {
    it('returns 1-based line numbers for matching lines', () => {
        const content = ['line one', 'bg-surface-canvas here', 'line three', 'bg-surface-canvas again'].join('\n');
        expect(getMatchingLines(content, 'bg-surface-canvas')).toEqual([2, 4]);
    });

    it('returns empty array when pattern is not found', () => {
        expect(getMatchingLines('nothing here', 'missing')).toEqual([]);
    });
});

// ─── findUsages ────────────────────────────────────────────────────────────────

describe('findUsages', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = mkdirSync(path.join(os.tmpdir(), `test-webapp-${Date.now()}`), { recursive: true }) ?? path.join(os.tmpdir(), `test-webapp-${Date.now()}`);
        // mkdirSync with recursive returns the path only when newly created on some Node versions
        // Re-derive it
        tmpDir = path.join(os.tmpdir(), `test-webapp-${Date.now()}`);
        mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('finds var() references in TSX files', async () => {
        writeFileSync(path.join(tmpDir, 'Comp.tsx'), `const s = { color: 'var(--surface-canvas)' };`);
        const usages = await findUsages(['--surface-canvas'], tmpDir);
        expect(usages['--surface-canvas']).toBeDefined();
        expect(usages['--surface-canvas']['var(--surface-canvas)']).toHaveLength(1);
        expect(usages['--surface-canvas']['var(--surface-canvas)'][0].lines).toContain(1);
    });

    it('finds Tailwind utility class usages', async () => {
        writeFileSync(path.join(tmpDir, 'Card.tsx'), `<div className="bg-surface-canvas text-text-strong" />`);
        const usages = await findUsages(['--surface-canvas', '--text-strong'], tmpDir);
        expect(usages['--surface-canvas']['bg-surface-canvas']).toBeDefined();
        expect(usages['--text-strong']['text-text-strong']).toBeDefined();
    });

    it('finds usages in CSS files', async () => {
        writeFileSync(path.join(tmpDir, 'styles.css'), `.foo { background: var(--surface-canvas); }`);
        const usages = await findUsages(['--surface-canvas'], tmpDir);
        expect(usages['--surface-canvas']['var(--surface-canvas)']).toBeDefined();
    });

    it('does not scan .d.ts files', async () => {
        writeFileSync(path.join(tmpDir, 'types.d.ts'), `// var(--surface-canvas)`);
        const usages = await findUsages(['--surface-canvas'], tmpDir);
        expect(Object.keys(usages)).toHaveLength(0);
    });

    it('ignores node_modules', async () => {
        const nmDir = path.join(tmpDir, 'node_modules', 'pkg');
        mkdirSync(nmDir, { recursive: true });
        writeFileSync(path.join(nmDir, 'index.tsx'), `var(--surface-canvas)`);
        const usages = await findUsages(['--surface-canvas'], tmpDir);
        expect(Object.keys(usages)).toHaveLength(0);
    });

    it('returns empty object when no usages found', async () => {
        writeFileSync(path.join(tmpDir, 'Clean.tsx'), `<div className="bg-white" />`);
        const usages = await findUsages(['--surface-canvas'], tmpDir);
        expect(Object.keys(usages)).toHaveLength(0);
    });

    it('does not generate Tailwind patterns for --ds-* vars', async () => {
        // bg-ds-color-neutral-50 should NOT be searched
        writeFileSync(path.join(tmpDir, 'Prim.tsx'), `style={{ background: 'var(--ds-color-neutral-50)' }}`);
        const usages = await findUsages(['--ds-color-neutral-50'], tmpDir);
        // Only var() pattern was searched — Tailwind pattern would be "bg-ds-color-neutral-50" etc.
        const patterns = Object.keys(usages['--ds-color-neutral-50'] ?? {});
        expect(patterns.every((p) => p.startsWith('var('))).toBe(true);
    });
});

// ─── reportUsages ──────────────────────────────────────────────────────────────

describe('reportUsages', () => {
    function captureStream() {
        // Use a mutable container so we don't lose the reference after destructuring
        const buf = { output: '' };
        const stream = { write: (chunk) => { buf.output += String(chunk); } };
        return { stream, buf };
    }

    it('returns false and writes nothing for empty usages', () => {
        const { stream, buf } = captureStream();
        const result = reportUsages({}, { stream });
        expect(result).toBe(false);
        expect(buf.output).toBe('');
    });

    it('returns true and writes a report when usages exist', () => {
        const { stream, buf } = captureStream();
        const usages = {
            '--surface-canvas': {
                'bg-surface-canvas': [{ file: 'packages/webapp/src/Card.tsx', lines: [12, 34] }],
                'var(--surface-canvas)': [{ file: 'packages/webapp/src/index.css', lines: [5] }]
            }
        };
        const result = reportUsages(usages, { stream });
        expect(result).toBe(true);
        expect(buf.output).toContain('--surface-canvas');
        expect(buf.output).toContain('bg-surface-canvas');
        expect(buf.output).toContain('Card.tsx:12');
        expect(buf.output).toContain('Card.tsx:34');
        expect(buf.output).toContain('index.css:5');
        expect(buf.output).toContain('1 removed token(s)');
        expect(buf.output).toContain('3 usage(s)');
    });

    it('counts hits across multiple tokens', () => {
        const { stream, buf } = captureStream();
        const usages = {
            '--text-strong': { 'text-text-strong': [{ file: 'a.tsx', lines: [1] }] },
            '--border-default': { 'border-border-default': [{ file: 'b.tsx', lines: [1] }] }
        };
        reportUsages(usages, { stream });
        expect(buf.output).toContain('2 removed token(s)');
        expect(buf.output).toContain('2 usage(s)');
    });
});

// ─── checkRemovedTokens ────────────────────────────────────────────────────────

describe('checkRemovedTokens', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `test-check-${Date.now()}`);
        mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns hasUsages: false when no tokens are removed', async () => {
        const css = `:root { --surface-canvas: #fff; }`;
        const result = await checkRemovedTokens({ oldCss: css, newCss: css, webappDir: tmpDir });
        expect(result.hasUsages).toBe(false);
        expect(result.removed).toHaveLength(0);
    });

    it('returns hasUsages: false when removed token has no webapp usages', async () => {
        const oldCss = `:root { --surface-canvas: #fff; --text-strong: #000; }`;
        const newCss = `:root { --surface-canvas: #fff; }`;
        writeFileSync(path.join(tmpDir, 'App.tsx'), `<div className="bg-white" />`);
        const result = await checkRemovedTokens({ oldCss, newCss, webappDir: tmpDir });
        expect(result.hasUsages).toBe(false);
        expect(result.removed).toContain('--text-strong');
    });

    it('returns hasUsages: true when removed token is still referenced', async () => {
        const oldCss = `:root { --surface-canvas: #fff; --text-strong: #000; }`;
        const newCss = `:root { --surface-canvas: #fff; }`;
        writeFileSync(path.join(tmpDir, 'App.tsx'), `<div className="text-text-strong" />`);
        const result = await checkRemovedTokens({ oldCss, newCss, webappDir: tmpDir });
        expect(result.hasUsages).toBe(true);
        expect(result.usages['--text-strong']).toBeDefined();
    });
});
