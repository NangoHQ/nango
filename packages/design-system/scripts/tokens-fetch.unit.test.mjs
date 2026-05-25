import { mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCss, buildCssBlock, buildPrimitivesBlock, buildTailwindThemeBlock, formatTokenValue, resolveTokens } from './tokens-fetch.mjs';

// ─── formatTokenValue ──────────────────────────────────────────────────────────

describe('formatTokenValue', () => {
    it('returns a plain string value as-is', () => {
        expect(formatTokenValue({ $value: '#ffffff', $type: 'color' })).toBe('#ffffff');
    });

    it('falls back to legacy value field', () => {
        expect(formatTokenValue({ value: '#000000', type: 'color' })).toBe('#000000');
    });

    it('returns empty string for undefined value', () => {
        expect(formatTokenValue({ $type: 'color' })).toBe('');
    });

    describe('boxShadow', () => {
        it('returns a CSS string value unchanged', () => {
            expect(formatTokenValue({ $type: 'boxShadow', $value: '0 1px 2px rgba(0,0,0,0.1)' })).toBe('0 1px 2px rgba(0,0,0,0.1)');
        });

        it('serialises a single shadow object', () => {
            const token = {
                $type: 'boxShadow',
                $value: { x: '0', y: '4', blur: '8', spread: '0', color: '#000000', type: 'dropShadow' }
            };
            expect(formatTokenValue(token)).toBe('0px 4px 8px 0px #000000');
        });

        it('serialises an array of shadow objects', () => {
            const token = {
                $type: 'boxShadow',
                $value: [
                    { x: '0', y: '0', blur: '0', spread: '2', color: '#ffffff', type: 'dropShadow' },
                    { x: '0', y: '0', blur: '0', spread: '4', color: '#0089b0', type: 'dropShadow' }
                ]
            };
            expect(formatTokenValue(token)).toBe('0px 0px 0px 2px #ffffff, 0px 0px 0px 4px #0089b0');
        });

        it('adds inset keyword for innerShadow type', () => {
            const token = {
                $type: 'boxShadow',
                $value: { x: '0', y: '1', blur: '2', spread: '0', color: '#000000', type: 'innerShadow' }
            };
            expect(formatTokenValue(token)).toBe('inset 0px 1px 2px 0px #000000');
        });

        it('returns none for an empty array', () => {
            expect(formatTokenValue({ $type: 'boxShadow', $value: [] })).toBe('none');
        });

        it('defaults missing shadow fields to 0 / transparent', () => {
            expect(formatTokenValue({ $type: 'boxShadow', $value: {} })).toBe('0px 0px 0px 0px transparent');
        });
    });
});

// ─── buildCssBlock ─────────────────────────────────────────────────────────────

describe('buildCssBlock', () => {
    it('wraps vars in the given selector', () => {
        const tokens = [
            { name: 'surface-canvas', $value: '#f5f5f5', $type: 'color' },
            { name: 'text-strong', $value: '#18191b', $type: 'color' }
        ];
        expect(buildCssBlock(tokens, ':root')).toBe(':root {\n  --surface-canvas: #f5f5f5;\n  --text-strong: #18191b;\n}');
    });

    it('uses [data-theme="dark"] selector', () => {
        const tokens = [{ name: 'surface-canvas', $value: '#000000', $type: 'color' }];
        expect(buildCssBlock(tokens, '[data-theme="dark"]')).toBe('[data-theme="dark"] {\n  --surface-canvas: #000000;\n}');
    });

    it('returns an empty block for no tokens', () => {
        expect(buildCssBlock([], ':root')).toBe(':root {\n\n}');
    });
});

// ─── buildPrimitivesBlock ──────────────────────────────────────────────────────

describe('buildPrimitivesBlock', () => {
    it('prefixes vars with --ds-', () => {
        const tokens = [{ name: 'color-neutral-50', $value: '#f5f5f5', $type: 'color' }];
        expect(buildPrimitivesBlock(tokens)).toBe(':root {\n  --ds-color-neutral-50: #f5f5f5;\n}');
    });
});

// ─── buildTailwindThemeBlock ───────────────────────────────────────────────────

describe('buildTailwindThemeBlock', () => {
    it('maps color tokens to --color-* vars', () => {
        const tokens = [
            { name: 'surface-canvas', $type: 'color' },
            { name: 'text-strong', $type: 'color' }
        ];
        expect(buildTailwindThemeBlock(tokens)).toBe(
            '@theme {\n  --color-surface-canvas: var(--surface-canvas);\n  --color-text-strong: var(--text-strong);\n}'
        );
    });

    it('excludes non-color tokens', () => {
        const tokens = [
            { name: 'surface-canvas', $type: 'color' },
            { name: 'focus-outline-default', $type: 'boxShadow' }
        ];
        expect(buildTailwindThemeBlock(tokens)).toBe('@theme {\n  --color-surface-canvas: var(--surface-canvas);\n}');
    });

    it('returns an empty @theme block for no color tokens', () => {
        expect(buildTailwindThemeBlock([])).toBe('@theme {\n\n}');
    });
});

// ─── buildCss ──────────────────────────────────────────────────────────────────

describe('buildCss', () => {
    it('throws if required token sets are missing', async () => {
        // Guards the pipeline against writing tokens.json when the Figma export
        // is missing one of the expected sets — the on-disk state stays consistent.
        await expect(buildCss({ Primitives: {} })).rejects.toThrow(/Expected Primitives, Semantic\/Light, and Semantic\/Dark/);
    });

    it('lists the sets it did find in the error message', async () => {
        await expect(buildCss({ Primitives: {}, 'Semantic/Light': {} })).rejects.toThrow(/Found: Primitives, Semantic\/Light/);
    });
});

// ─── resolveTokens — strict flag ──────────────────────────────────────────────

describe('resolveTokens — strict flag', () => {
    let tmpDir;

    // Token files used across tests:
    //   valid.json   — one color token with a resolvable self-reference alias
    //   broken.json  — one good token + one pointing to a non-existent alias

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `ds-test-${Date.now()}`);
        mkdirSync(tmpDir, { recursive: true });

        writeFileSync(
            path.join(tmpDir, 'valid.json'),
            JSON.stringify({
                color: {
                    blue: { $value: '#3b82f6', $type: 'color' }
                },
                text: {
                    primary: { $value: '{color.blue}', $type: 'color' }
                }
            })
        );

        writeFileSync(
            path.join(tmpDir, 'broken.json'),
            JSON.stringify({
                color: {
                    blue: { $value: '#3b82f6', $type: 'color' }
                },
                text: {
                    primary: { $value: '{color.blue}', $type: 'color' },
                    muted: { $value: '{nonexistent.token}', $type: 'color' }
                }
            })
        );
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('resolves valid aliases in non-strict mode', async () => {
        const tokens = await resolveTokens({ sourceFiles: [path.join(tmpDir, 'valid.json')] });
        const names = tokens.map((t) => t.path.join('.'));
        expect(names).toContain('color.blue');
        expect(names).toContain('text.primary');
    });

    it('skips unresolved aliases and warns in non-strict mode (default)', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const tokens = await resolveTokens({ sourceFiles: [path.join(tmpDir, 'broken.json')] });
            // The broken token should be silently dropped
            const names = tokens.map((t) => t.path.join('.'));
            expect(names).not.toContain('text.muted');
            // Valid tokens still present
            expect(names).toContain('color.blue');
            expect(names).toContain('text.primary');
            // A warning was emitted
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('text.muted'));
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('{nonexistent.token}'));
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('throws on unresolved aliases in strict mode', async () => {
        await expect(
            resolveTokens({ sourceFiles: [path.join(tmpDir, 'broken.json')], strict: true })
        ).rejects.toThrow(/Unresolved token alias: text\.muted → \{nonexistent\.token\}/);
    });

    it('does not throw for a fully resolved token set in strict mode', async () => {
        await expect(
            resolveTokens({ sourceFiles: [path.join(tmpDir, 'valid.json')], strict: true })
        ).resolves.not.toThrow();
    });
});
