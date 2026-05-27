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
    // Minimal valid token set — both color and boxShadow are always required.
    const BASE_TOKENS = [
        { name: 'surface-canvas', $type: 'color' },
        { name: 'focus-outline-default', $type: 'boxShadow' }
    ];

    it('maps color tokens to --color-* vars', () => {
        const tokens = [...BASE_TOKENS, { name: 'text-strong', $type: 'color' }];
        expect(buildTailwindThemeBlock(tokens)).toContain('--color-surface-canvas: var(--surface-canvas)');
        expect(buildTailwindThemeBlock(tokens)).toContain('--color-text-strong: var(--text-strong)');
    });

    it('emits boxShadow tokens in a separate @theme inline block', () => {
        expect(buildTailwindThemeBlock(BASE_TOKENS)).toBe(
            '@theme {\n  --color-surface-canvas: var(--surface-canvas);\n}\n@theme inline {\n  --shadow-focus-outline-default: var(--focus-outline-default);\n}'
        );
    });

    it('excludes non-color, non-boxShadow tokens', () => {
        const tokens = [...BASE_TOKENS, { name: 'ds-space-2', $type: 'spacing' }];
        expect(buildTailwindThemeBlock(tokens)).not.toContain('ds-space-2');
    });

    it('returns empty @theme blocks for an empty token list', () => {
        expect(buildTailwindThemeBlock([])).toBe('@theme {\n\n}\n@theme inline {\n\n}');
    });

    it('throws when tokens are present but none are color type', () => {
        const tokens = [{ name: 'focus-outline-default', $type: 'boxShadow' }];
        expect(() => buildTailwindThemeBlock(tokens)).toThrow(/no color tokens found/);
    });

    it('throws when tokens are present but none are boxShadow type', () => {
        const tokens = [{ name: 'surface-canvas', $type: 'color' }];
        expect(() => buildTailwindThemeBlock(tokens)).toThrow(/no boxShadow tokens found/);
    });
});

// ─── buildPrimitivesThemeBlock ────────────────────────────────────────────────

describe('buildPrimitivesThemeBlock', () => {
    // Minimal token set that satisfies all required prefix groups.
    // Per-mapping tests use this fixture to avoid tripping the completeness guard,
    // then assert on the specific entry they care about via toContain.
    const BASE_TOKENS = [
        { name: 'radius-sm', $type: 'borderRadius', $value: '4px' },
        { name: 'border-width-1', $type: 'borderWidth', $value: '1px' },
        { name: 'typography-font-size-md', $type: 'dimension', $value: '14px' },
        { name: 'typography-font-weight-medium', $type: 'fontWeight', $value: '500' },
        { name: 'typography-line-height-normal', $type: 'dimension', $value: '1.5' },
        { name: 'typography-letter-spacing-tight', $type: 'dimension', $value: '-0.01em' }
    ];

    it('maps radius-* tokens to --radius-ds-*', () => {
        expect(buildPrimitivesThemeBlock(BASE_TOKENS)).toContain('--radius-ds-sm: var(--ds-radius-sm)');
    });

    it('maps border-width-* tokens to --border-width-ds-*', () => {
        expect(buildPrimitivesThemeBlock(BASE_TOKENS)).toContain('--border-width-ds-1: var(--ds-border-width-1)');
    });

    it('maps typography-font-size-* tokens to --text-ds-*', () => {
        expect(buildPrimitivesThemeBlock(BASE_TOKENS)).toContain('--text-ds-md: var(--ds-typography-font-size-md)');
    });

    it('maps typography-font-weight-* tokens to --font-weight-ds-*', () => {
        expect(buildPrimitivesThemeBlock(BASE_TOKENS)).toContain('--font-weight-ds-medium: var(--ds-typography-font-weight-medium)');
    });

    it('maps typography-line-height-* tokens to --leading-ds-*', () => {
        expect(buildPrimitivesThemeBlock(BASE_TOKENS)).toContain('--leading-ds-normal: var(--ds-typography-line-height-normal)');
    });

    it('maps typography-line-height-* tokens to --leading-ds-*', () => {
        const tokens = [{ name: 'typography-line-height-normal', $type: 'dimension', $value: '1.5' }];
        expect(buildPrimitivesThemeBlock(tokens)).toBe('@theme {\n  --leading-ds-normal: var(--ds-typography-line-height-normal);\n}');
    });

    it('maps typography-letter-spacing-* tokens to --tracking-ds-*', () => {
        expect(buildPrimitivesThemeBlock(BASE_TOKENS)).toContain('--tracking-ds-tight: var(--ds-typography-letter-spacing-tight)');
    });

    it('ignores tokens that do not match any mapped prefix', () => {
        const tokens = [...BASE_TOKENS, { name: 'color-neutral-50', $type: 'color', $value: '#f9fafb' }];
        expect(buildPrimitivesThemeBlock(tokens)).not.toContain('color-neutral-50');
    });

    it('throws when a required prefix group produces no entries', () => {
        const missingRadius = BASE_TOKENS.filter((t) => !t.name.startsWith('radius-'));
        expect(() => buildPrimitivesThemeBlock(missingRadius)).toThrow(/prefix 'radius-'.*renamed or deleted/);
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
