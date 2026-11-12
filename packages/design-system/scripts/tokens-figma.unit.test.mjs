import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';

import {
    applyResults,
    buildApplyPayloads,
    buildCheckPayload,
    buildDesiredState,
    canonicalStyle,
    canonicalVariable,
    describeDiff,
    hashOf,
    parseColor,
    parseCssShadows,
    parseDimension,
    parseDuration,
    pullDescriptions,
    staleReferences,
    toVariableValue
} from './tokens-figma.mjs';

const runtime = readFileSync(new URL('./tokens-figma-runtime.js', import.meta.url), 'utf8');

function fixture() {
    return {
        Primitives: {
            color: {
                neutral: { 0: { $type: 'color', $value: '#ffffff' }, 975: { $type: 'color', $value: '#000000' } },
                info: { 500: { $type: 'color', $value: '{color.neutral.0}' } }
            },
            motion: { duration: { fast: { $type: 'duration', $value: '100ms' } } },
            elevation: { 1: { $type: 'boxShadow', $value: { x: '0', y: '1', blur: '2', spread: '0', color: 'rgba(0, 0, 0, 0.08)', type: 'dropShadow' } } },
            typography: {
                fontFamily: { sans: { $type: 'fontFamilies', $value: 'Geist, sans-serif' } },
                fontWeight: { regular: { $type: 'fontWeights', $value: '400' } },
                fontSize: { md: { $type: 'dimension', $value: '14px' } },
                lineHeight: { normal: { $type: 'number', $value: 1.5 } },
                letterSpacing: { tight: { $type: 'dimension', $value: '-0.01em' } }
            }
        },
        'Semantic/Light': {
            $description: { $type: 'other', $value: 'ignored' },
            surface: { canvas: { $type: 'color', $value: '{color.neutral.0}', $description: 'App shell' } },
            focus: {
                outline: {
                    $type: 'boxShadow',
                    $value: [
                        { x: '0', y: '0', blur: '0', spread: '2', color: '{surface.canvas}', type: 'dropShadow' },
                        { x: '0', y: '0', blur: '0', spread: '4', color: '{color.info.500}', type: 'dropShadow' }
                    ]
                }
            }
        },
        'Semantic/Dark': {
            surface: { canvas: { $type: 'color', $value: '{color.neutral.975}' } },
            focus: { outline: { $type: 'boxShadow', $value: '{elevation.1}' } }
        },
        Typography: {
            text: {
                md: {
                    $type: 'typography',
                    $value: {
                        fontFamily: '{typography.fontFamily.sans}',
                        fontWeight: '{typography.fontWeight.regular}',
                        fontSize: '{typography.fontSize.md}',
                        lineHeight: '{typography.lineHeight.normal}',
                        letterSpacing: '{typography.letterSpacing.tight}'
                    }
                }
            }
        },
        $themes: [
            {
                name: 'Primitives',
                $figmaCollectionId: 'C:1',
                $figmaModeId: 'm1',
                $figmaVariableReferences: { 'color.neutral.0': 'k-neutral-0' },
                $figmaStyleReferences: {}
            },
            {
                name: 'Dark',
                $figmaCollectionId: 'C:2',
                $figmaModeId: 'm2',
                $figmaVariableReferences: { 'surface.canvas': 'k-canvas' },
                $figmaStyleReferences: {}
            },
            {
                name: 'Light',
                $figmaCollectionId: 'C:2',
                $figmaModeId: 'm3',
                $figmaVariableReferences: { 'surface.canvas': 'k-canvas', 'gone.token': 'k-gone' },
                $figmaStyleReferences: { 'elevation.1': 'S:stale' }
            }
        ]
    };
}

describe('value conversion', () => {
    it('parses hex and rgba colors into 0–1 channels', () => {
        expect(parseColor('#ff000080')).toEqual({ r: 1, g: 0, b: 0, a: 0.502 });
        expect(parseColor('rgba(0, 0, 0, 0.08)')).toEqual({ r: 0, g: 0, b: 0, a: 0.08 });
    });

    it('converts em dimensions at a 16px base', () => {
        expect(parseDimension('-0.01em')).toBe(-0.16);
        expect(parseDimension('240px')).toBe(240);
    });

    it('parses CSS shadow strings', () => {
        expect(parseCssShadows('none')).toEqual([]);
        expect(parseCssShadows('0 1px 2px rgba(0, 0, 0, 0.08), inset 0 0 0 1px #fff')).toEqual([
            { x: '0', y: '1px', blur: '2px', spread: '0', color: 'rgba(0, 0, 0, 0.08)', type: 'dropShadow' },
            { x: '0', y: '0', blur: '0', spread: '1px', color: '#fff', type: 'innerShadow' }
        ]);
    });

    it('converts durations to seconds', () => {
        expect(parseDuration('100ms')).toBe(0.1);
        expect(parseDuration('0.2s')).toBe(0.2);
    });

    it('scales opacity to a percentage and keeps the first font family', () => {
        expect(toVariableValue('opacity', '0.08')).toEqual({ type: 'FLOAT', value: 8 });
        expect(toVariableValue('fontFamilies', 'Geist, sans-serif')).toEqual({ type: 'STRING', value: 'Geist' });
    });
});

describe('buildDesiredState', () => {
    const desired = buildDesiredState(fixture());

    it('puts semantic tokens in one collection with a mode per theme', () => {
        const canvas = desired.variables.find((v) => v.name === 'surface/canvas');
        expect(canvas).toMatchObject({ collection: 'Colors', key: 'k-canvas', description: 'App shell' });
        expect(canvas.valuesByMode).toEqual({ Dark: { alias: 'color/neutral/975' }, Light: { alias: 'color/neutral/0' } });
    });

    it('turns box shadows into effect styles, top shadow last', () => {
        const outline = desired.styles.find((s) => s.name === 'Light/outline');
        expect(outline.effects.map((e) => [e.spread, e.colorAlias])).toEqual([
            [4, 'color/info/500'],
            [2, 'surface/canvas']
        ]);
    });

    it('resolves a box shadow that aliases another', () => {
        const dark = desired.styles.find((s) => s.name === 'Dark/outline');
        expect(dark.effects).toHaveLength(1);
        expect(dark.effects[0]).toMatchObject({ y: 1, blur: 2 });
    });

    it('builds text styles bound to the typography variables', () => {
        const text = desired.styles.find((s) => s.name === 'text/md');
        expect(text).toMatchObject({ lineHeightPercent: 150, fontSize: { value: 14, alias: 'typography/fontSize/md' } });
    });

    it('reports a token missing from one theme', () => {
        const tokens = fixture();
        tokens['Semantic/Light'].surface.page = { $type: 'color', $value: '{color.neutral.0}' };
        expect(buildDesiredState(tokens).errors).toEqual(['surface.page is missing from Semantic/Dark']);
    });
});

describe('payloads', () => {
    const desired = buildDesiredState(fixture());

    it('keeps the check payload under the use_figma limit and descriptions out of the value hash', () => {
        const code = buildCheckPayload(desired, runtime);
        expect(code.length).toBeLessThan(50000);
        const canvas = desired.variables.find((v) => v.name === 'surface/canvas');
        expect(hashOf(canonicalVariable({ ...canvas, description: 'changed' }))).toBe(hashOf(canonicalVariable(canvas)));
    });

    it('only sends changed items to apply', () => {
        const [code] = buildApplyPayloads(desired, runtime, [{ kind: 'variable', name: 'surface/canvas' }]);
        expect(code).toContain('"name":"surface/canvas"');
        expect(code).not.toContain('"name":"color/neutral/975"');
    });

    it('describes a value change field by field', () => {
        const text = desired.styles.find((s) => s.name === 'text/md');
        const current = { ...canonicalStyle(text), s: 13 };
        expect(describeDiff(desired, { changed: [{ kind: 'text', name: 'text/md', current }] })).toEqual(['~ text text/md: s 13 → 14']);
    });
});

describe('pullDescriptions', () => {
    it('fills empty descriptions in every set that owns the token and keeps the repo ones', () => {
        const tokens = fixture();
        const descriptions = [
            { kind: 'variable', name: 'surface/canvas', text: 'From Figma' },
            { kind: 'text', name: 'text/md', text: 'Body text' },
            { kind: 'variable', name: 'color/neutral/0', text: '' }
        ];
        const { tokens: next, pulled, conflicts } = pullDescriptions(tokens, buildDesiredState(tokens), { descriptions });
        expect(next['Semantic/Dark'].surface.canvas.$description).toBe('From Figma');
        expect(next['Semantic/Light'].surface.canvas.$description).toBe('App shell');
        expect(next.Typography.text.md.$description).toBe('Body text');
        expect(next.Primitives.color.neutral[0].$description).toBeUndefined();
        expect(pulled).toEqual(['Semantic/Dark surface.canvas', 'Typography text.md']);
        expect(conflicts).toEqual(['Semantic/Light surface.canvas']);
    });
});

describe('writing keys back', () => {
    it('adds created keys to every theme that owns the token and drops stale ones', () => {
        const tokens = fixture();
        const desired = buildDesiredState(tokens);
        const stale = staleReferences(tokens, desired);
        expect(stale.map((s) => `${s.theme}:${s.path}`)).toEqual(['Light:gone.token', 'Light:elevation.1']);

        const next = applyResults(tokens, [{ created: { variables: [{ collection: 'Colors', name: 'surface/page', key: 'k-page' }], styles: [] } }], stale);
        const light = next.$themes.find((t) => t.name === 'Light');
        expect(light.$figmaVariableReferences).toEqual({ 'surface.canvas': 'k-canvas', 'surface.page': 'k-page' });
        expect(light.$figmaStyleReferences).toEqual({});
        expect(next.$themes.find((t) => t.name === 'Dark').$figmaVariableReferences['surface.page']).toBe('k-page');
    });
});
