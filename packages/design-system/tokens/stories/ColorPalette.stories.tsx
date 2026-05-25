import tokensJson from '../tokens.json';

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

/** Walk a token group object and collect CSS variable names for leaf color tokens only */
function collectVars(obj: Record<string, unknown>, path: string[] = []): string[] {
    const vars: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('$')) continue;
        if (value && typeof value === 'object' && '$value' in value) {
            const token = value as Record<string, unknown>;
            if (token['$type'] === 'color') {
                vars.push(pathToCssVar([...path, key]));
            }
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
    const status = semanticLight['status'] as Record<string, unknown> | undefined;
    const group = status?.[statusKey] as Record<string, unknown> | undefined;
    if (!group) return { label, tokens: [] };
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

/** Capitalise first letter */
function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build primitive color ramps from tokens.json.
 * - 'transparent' is excluded (single value, not a ramp)
 * - Nested groups (alpha, accent) produce one ramp per sub-group so each
 *   row spans the full width like the flat ramps (neutral, brand, etc.)
 */
const PRIMITIVE_RAMPS: PrimitiveRamp[] = [];

// Display order for color groups — alpha follows neutral since they share the same base scale
const COLOR_GROUP_ORDER = ['mono', 'neutral', 'alpha', 'brand', 'info', 'success', 'warning', 'danger', 'accent'];
const sortedColorEntries = Object.entries(primitiveColor)
    .filter(([k]) => !k.startsWith('$') && k !== 'transparent')
    .sort(([a], [b]) => {
        const ai = COLOR_GROUP_ORDER.indexOf(a);
        const bi = COLOR_GROUP_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

for (const [key, group] of sortedColorEntries) {
    if (key.startsWith('$') || key === 'transparent') continue;

    const entries = Object.entries(group).filter(([k]) => !k.startsWith('$'));
    const isNested = entries.some(([, v]) => v && typeof v === 'object' && !('$value' in v));

    if (isNested) {
        // If each sub-group has only one step (e.g. accent.blue.500), combine into
        // one row using the sub-group key as the label. Otherwise (e.g. alpha.white.*),
        // emit one row per sub-group so it spans the full width.
        const subGroups = entries
            .filter(([, v]) => v && typeof v === 'object' && !('$value' in v))
            .map(([subKey, subGroup]) => ({
                subKey,
                steps: Object.entries(subGroup as Record<string, unknown>).filter(([k, v]) => !k.startsWith('$') && v && typeof v === 'object' && '$value' in v)
            }));

        const allSingleStep = subGroups.every(({ steps }) => steps.length === 1);

        if (allSingleStep) {
            // One combined row, step label = sub-group key, e.g. "blue", "violet"
            const vars = subGroups.map(({ subKey, steps }) => ({
                step: subKey,
                cssVar: `--ds-color-${toKebab(key)}-${toKebab(subKey)}-${steps[0][0]}`
            }));
            PRIMITIVE_RAMPS.push({ label: capitalize(key), vars });
        } else {
            // One row per sub-group, e.g. "Alpha · White", "Alpha · Black"
            for (const { subKey, steps } of subGroups) {
                const vars = steps.map(([step]) => ({ step, cssVar: `--ds-color-${toKebab(key)}-${toKebab(subKey)}-${step}` }));
                PRIMITIVE_RAMPS.push({ label: `${capitalize(key)} · ${capitalize(subKey)}`, vars });
            }
        }
    } else {
        // Flat ramp, e.g. "Neutral", "Brand"
        const vars = entries
            .filter(([, v]) => v && typeof v === 'object' && '$value' in v)
            .map(([step]) => ({ step, cssVar: `--ds-color-${toKebab(key)}-${step}` }));
        PRIMITIVE_RAMPS.push({ label: capitalize(key), vars });
    }
}

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
