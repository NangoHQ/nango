import tokensJson from '../../tokens/tokens.json';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Tokens/Color Palette',
    parameters: {
        layout: 'padded'
    }
};

export default meta;

// ─── Token derivation ────────────────────────────────────────────────────────

/** Convert a token path segment from camelCase to kebab-case */
function toKebab(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Convert a token path array to a CSS custom property name, e.g. ['surface', 'panelMuted'] → '--surface-panel-muted' */
function pathToCssVar(path: string[]): string {
    return '--' + path.map(toKebab).join('-');
}

/** Walk a token group object and collect CSS variable names for all leaf tokens */
function collectVars(obj: Record<string, unknown>, path: string[] = []): string[] {
    const vars: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('$')) continue;
        if (value && typeof value === 'object' && '$value' in value) {
            vars.push(pathToCssVar([...path, key]));
        } else if (value && typeof value === 'object') {
            vars.push(...collectVars(value as Record<string, unknown>, [...path, key]));
        }
    }
    return vars;
}

// Build semantic groups directly from tokens.json — stays in sync with Figma automatically
const semanticLight = (tokensJson as Record<string, unknown>)['Semantic/Light'] as Record<string, unknown>;

interface TokenGroup {
    label: string;
    tokens: string[];
}

function buildGroup(key: string, label: string): TokenGroup {
    const group = semanticLight[key] as Record<string, unknown>;
    return { label, tokens: collectVars(group, [key]) };
}

function buildStatusGroup(statusKey: string, label: string): TokenGroup {
    const status = semanticLight['status'] as Record<string, unknown>;
    const group = status[statusKey] as Record<string, unknown>;
    return { label, tokens: collectVars(group, ['status', statusKey]) };
}

const SEMANTIC_GROUPS: TokenGroup[] = [
    buildGroup('surface', 'Surface'),
    buildGroup('text', 'Text'),
    buildGroup('border', 'Border'),
    buildGroup('icon', 'Icon'),
    buildGroup('interactive', 'Interactive'),
    buildGroup('state', 'State'),
    buildGroup('focus', 'Focus'),
    buildStatusGroup('neutral', 'Status · Neutral'),
    buildStatusGroup('info', 'Status · Info'),
    buildStatusGroup('success', 'Status · Success'),
    buildStatusGroup('warning', 'Status · Warning'),
    buildStatusGroup('danger', 'Status · Danger'),
    buildGroup('container', 'Container'),
    buildGroup('chart', 'Chart'),
    buildGroup('control', 'Control')
];

// ─── Primitive palette ───────────────────────────────────────────────────────

const primitiveColor = ((tokensJson as Record<string, unknown>)['Primitives'] as Record<string, unknown>)['color'] as Record<string, Record<string, unknown>>;

interface PrimitiveRamp {
    label: string;
    vars: { step: string; cssVar: string }[];
}

/** Collect all leaf steps from a color group, handling one level of nesting (e.g. alpha.white, accent.blue) */
function collectColorSteps(groupKey: string, group: Record<string, unknown>): { step: string; cssVar: string }[] {
    const vars: { step: string; cssVar: string }[] = [];
    for (const [k, v] of Object.entries(group)) {
        if (k.startsWith('$')) continue;
        if (v && typeof v === 'object' && '$value' in v) {
            // Flat leaf: e.g. neutral.50
            vars.push({ step: k, cssVar: `--ds-color-${toKebab(groupKey)}-${k}` });
        } else if (v && typeof v === 'object') {
            // One level nested: e.g. alpha.white.8, accent.blue.500
            for (const [step, leaf] of Object.entries(v as Record<string, unknown>)) {
                if (step.startsWith('$')) continue;
                if (leaf && typeof leaf === 'object' && '$value' in leaf) {
                    vars.push({ step: `${k}-${step}`, cssVar: `--ds-color-${toKebab(groupKey)}-${toKebab(k)}-${step}` });
                }
            }
        }
    }
    return vars;
}

/** Capitalise first letter */
function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

const PRIMITIVE_RAMPS: PrimitiveRamp[] = Object.entries(primitiveColor)
    .filter(([k]) => !k.startsWith('$'))
    .map(([key, group]) => ({
        label: capitalize(key),
        vars: collectColorSteps(key, group)
    }));

// ─── Components ─────────────────────────────────────────────────────────────

function Swatch({ token }: { token: string }) {
    return (
        <div className="flex items-center gap-2.5 py-1.5">
            <div className="w-8 h-8 rounded-[6px] border border-border-default shrink-0" style={{ backgroundColor: `var(${token})` }} />
            <span className="text-xs font-mono text-text-secondary">{token}</span>
        </div>
    );
}

function Group({ group }: { group: TokenGroup }) {
    return (
        <div className="mb-8">
            <h2 className="story-section-heading mb-2">{group.label}</h2>
            <div className="grid grid-cols-3 gap-x-6 p-3 rounded-lg border border-border-default bg-surface-panel">
                {group.tokens.map((token) => (
                    <Swatch key={token} token={token} />
                ))}
            </div>
        </div>
    );
}

function RampSwatch({ cssVar, step }: { cssVar: string; step: string }) {
    return (
        <div className="flex flex-col gap-1 items-center">
            <div className="w-full h-10 rounded border border-border-muted" style={{ backgroundColor: `var(${cssVar})` }} />
            <span className="text-[10px] text-text-secondary font-mono">{step}</span>
        </div>
    );
}

// ─── Stories ────────────────────────────────────────────────────────────────

type Story = StoryObj<typeof meta>;

export const Primitives: Story = {
    name: 'Primitives',
    render: () => (
        <div className="max-w-[960px] p-8">
            {PRIMITIVE_RAMPS.map((ramp) => (
                <div key={ramp.label} className="mb-8">
                    <h2 className="story-section-heading mb-2.5">{ramp.label}</h2>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${ramp.vars.length}, 1fr)` }}>
                        {ramp.vars.map(({ step, cssVar }) => (
                            <RampSwatch key={step} cssVar={cssVar} step={step} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
};

export const SemanticTokens: Story = {
    name: 'Semantic',
    render: () => (
        <div className="max-w-[1200px] p-8">
            {SEMANTIC_GROUPS.map((group) => (
                <Group key={group.label} group={group} />
            ))}
        </div>
    )
};
