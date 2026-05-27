import { describe, expect, it } from 'vitest';

import {
    buildCss,
    buildCssBlock,
    buildPrimitivesBlock,
    buildPrimitivesThemeBlock,
    buildTailwindThemeBlock,
    buildTypographyBlock,
    formatTokenValue
} from './tokens-fetch.mjs';

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

    it('includes boxShadow tokens as --shadow-* vars', () => {
        const tokens = [
            { name: 'surface-canvas', $type: 'color' },
            { name: 'focus-outline-default', $type: 'boxShadow' }
        ];
        expect(buildTailwindThemeBlock(tokens)).toBe(
            '@theme {\n  --color-surface-canvas: var(--surface-canvas);\n  --shadow-focus-outline-default: var(--focus-outline-default);\n}'
        );
    });

    it('excludes non-color, non-boxShadow tokens', () => {
        const tokens = [
            { name: 'surface-canvas', $type: 'color' },
            { name: 'ds-space-2', $type: 'spacing' }
        ];
        expect(buildTailwindThemeBlock(tokens)).toBe('@theme {\n  --color-surface-canvas: var(--surface-canvas);\n}');
    });

    it('returns an empty @theme block for no color tokens', () => {
        expect(buildTailwindThemeBlock([])).toBe('@theme {\n\n}');
    });
});

// ─── buildPrimitivesThemeBlock ────────────────────────────────────────────────

describe('buildPrimitivesThemeBlock', () => {
    it('maps radius-* tokens to --radius-ds-*', () => {
        const tokens = [{ name: 'radius-sm', $type: 'borderRadius', $value: '4px' }];
        expect(buildPrimitivesThemeBlock(tokens)).toBe('@theme {\n  --radius-ds-sm: var(--ds-radius-sm);\n}');
    });

    it('maps border-width-* tokens to --border-width-ds-*', () => {
        const tokens = [{ name: 'border-width-1', $type: 'borderWidth', $value: '1px' }];
        expect(buildPrimitivesThemeBlock(tokens)).toBe('@theme {\n  --border-width-ds-1: var(--ds-border-width-1);\n}');
    });

    it('maps typography-font-size-* tokens to --text-ds-*', () => {
        const tokens = [{ name: 'typography-font-size-md', $type: 'dimension', $value: '14px' }];
        expect(buildPrimitivesThemeBlock(tokens)).toBe('@theme {\n  --text-ds-md: var(--ds-typography-font-size-md);\n}');
    });

    it('maps typography-font-weight-* tokens to --font-weight-ds-*', () => {
        const tokens = [{ name: 'typography-font-weight-medium', $type: 'fontWeight', $value: '500' }];
        expect(buildPrimitivesThemeBlock(tokens)).toBe('@theme {\n  --font-weight-ds-medium: var(--ds-typography-font-weight-medium);\n}');
    });

    it('maps typography-line-height-* tokens to --leading-ds-*', () => {
        const tokens = [{ name: 'typography-line-height-normal', $type: 'dimension', $value: '1.5' }];
        expect(buildPrimitivesThemeBlock(tokens)).toBe('@theme {\n  --leading-ds-normal: var(--ds-typography-line-height-normal);\n}');
    });

    it('maps typography-letter-spacing-* tokens to --tracking-ds-*', () => {
        const tokens = [{ name: 'typography-letter-spacing-tight', $type: 'dimension', $value: '-0.01em' }];
        expect(buildPrimitivesThemeBlock(tokens)).toBe('@theme {\n  --tracking-ds-tight: var(--ds-typography-letter-spacing-tight);\n}');
    });

    it('ignores tokens that do not match any mapped prefix', () => {
        const tokens = [{ name: 'color-neutral-50', $type: 'color', $value: '#f9fafb' }];
        expect(buildPrimitivesThemeBlock(tokens)).toBe('');
    });

    it('returns empty string for an empty token list', () => {
        expect(buildPrimitivesThemeBlock([])).toBe('');
    });
});

// ─── buildTypographyBlock ──────────────────────────────────────────────────────

describe('buildTypographyBlock', () => {
    it('returns empty string when no typography tokens', () => {
        expect(buildTypographyBlock([])).toBe('');
        expect(buildTypographyBlock([{ name: 'heading-lg', $type: 'color', $value: '#fff' }])).toBe('');
    });

    it('generates a CSS class for a typography token', () => {
        const tokens = [
            {
                name: 'heading-lg',
                $type: 'typography',
                $value: { fontFamily: 'Geist', fontSize: '24px', fontWeight: '400', lineHeight: '1.2', letterSpacing: '-0.01em' }
            }
        ];
        expect(buildTypographyBlock(tokens)).toBe(
            '.type-heading-lg {\n    font-family: Geist;\n    font-size: 24px;\n    font-weight: 400;\n    line-height: 1.2;\n    letter-spacing: -0.01em;\n}'
        );
    });

    it('omits optional properties that are absent', () => {
        const tokens = [
            {
                name: 'text-regular-md',
                $type: 'typography',
                $value: { fontFamily: 'Geist', fontSize: '14px', fontWeight: '400', lineHeight: '1.5' }
            }
        ];
        const result = buildTypographyBlock(tokens);
        expect(result).toContain('font-family: Geist');
        expect(result).not.toContain('letter-spacing');
    });

    it('includes letter-spacing when value is 0', () => {
        const tokens = [
            {
                name: 'text-regular-md',
                $type: 'typography',
                $value: { fontFamily: 'Geist', fontSize: '14px', fontWeight: '400', lineHeight: '1.5', letterSpacing: '0em' }
            }
        ];
        expect(buildTypographyBlock(tokens)).toContain('letter-spacing: 0em');
    });

    it('generates multiple classes separated by a blank line', () => {
        const tokens = [
            { name: 'heading-lg', $type: 'typography', $value: { fontFamily: 'Geist', fontSize: '24px', fontWeight: '400', lineHeight: '1.2' } },
            { name: 'heading-md', $type: 'typography', $value: { fontFamily: 'Geist', fontSize: '20px', fontWeight: '400', lineHeight: '1.2' } }
        ];
        const result = buildTypographyBlock(tokens);
        expect(result).toContain('.type-heading-lg {');
        expect(result).toContain('.type-heading-md {');
        expect(result).toContain('}\n\n.');
    });

    it('skips tokens with a non-object value', () => {
        const tokens = [
            { name: 'broken', $type: 'typography', $value: 'invalid' },
            { name: 'heading-lg', $type: 'typography', $value: { fontFamily: 'Geist', fontSize: '24px', fontWeight: '400', lineHeight: '1.2' } }
        ];
        const result = buildTypographyBlock(tokens);
        expect(result).not.toContain('.type-broken');
        expect(result).toContain('.type-heading-lg');
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
