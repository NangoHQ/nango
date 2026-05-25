import tokensJson from '../tokens.json';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Tokens/Color Palette',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toKebab(s: string) {
    return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function collectColorVars(obj: Record<string, unknown>, path: string[]): string[] {
    return Object.entries(obj).flatMap(([k, v]) => {
        if (k.startsWith('$') || !v || typeof v !== 'object') return [];
        const next = [...path, toKebab(k)];
        if ('$value' in v) return (v as any).$type === 'color' ? ['--' + next.join('-')] : [];
        return collectColorVars(v as Record<string, unknown>, next);
    });
}

// ─── Semantic data ────────────────────────────────────────────────────────────

const semanticLight = (tokensJson as any)['Semantic/Light'] as Record<string, unknown>;

const SEMANTIC_GROUPS = Object.entries(semanticLight)
    .filter(([k]) => !k.startsWith('$'))
    .map(([k, v]) => ({ label: k, vars: collectColorVars(v as Record<string, unknown>, [toKebab(k)]) }))
    .filter((g) => g.vars.length > 0);

// ─── Primitive data ───────────────────────────────────────────────────────────

interface Ramp {
    label: string;
    steps: { step: string; cssVar: string }[];
}

const COLOR_ORDER = ['mono', 'neutral', 'alpha', 'brand', 'info', 'success', 'warning', 'danger', 'accent'];

const leaves = (obj: object) => Object.entries(obj).filter(([k]) => !k.startsWith('$'));

function collectRamps(colorGroup: Record<string, unknown>): Ramp[] {
    return Object.entries(colorGroup)
        .filter(([k]) => !k.startsWith('$') && k !== 'transparent')
        .sort(([a], [b]) => (COLOR_ORDER.indexOf(a) + 1 || 999) - (COLOR_ORDER.indexOf(b) + 1 || 999))
        .flatMap(([name, group]) => {
            if (!group || typeof group !== 'object') return [];
            const children = leaves(group);

            // Flat ramp (neutral, brand, …): children are all leaf tokens
            if (children.every(([, v]) => '$value' in (v as object))) {
                return [{ label: capitalize(name), steps: children.map(([step]) => ({ step, cssVar: `--ds-color-${toKebab(name)}-${step}` })) }];
            }

            const subRamps = children.map(([subName, subGroup]) => ({ subName, steps: leaves(subGroup as object) }));

            // accent-style: each sub-group has exactly one step → merge into one ramp, sub-names become step labels
            if (subRamps.every(({ steps }) => steps.length === 1)) {
                return [
                    {
                        label: capitalize(name),
                        steps: subRamps.map(({ subName, steps }) => ({
                            step: subName,
                            cssVar: `--ds-color-${toKebab(name)}-${toKebab(subName)}-${steps[0][0]}`
                        }))
                    }
                ];
            }

            // alpha-style: each sub-group has multiple steps → one ramp row per sub-group
            return subRamps.map(({ subName, steps }) => ({
                label: `${capitalize(name)} · ${capitalize(subName)}`,
                steps: steps.map(([step]) => ({ step, cssVar: `--ds-color-${toKebab(name)}-${toKebab(subName)}-${step}` }))
            }));
        });
}

const PRIMITIVE_RAMPS = collectRamps((tokensJson as any)['Primitives']['color']);

// ─── Components ──────────────────────────────────────────────────────────────

function Swatch({ cssVar }: { cssVar: string }) {
    return (
        <div className="flex items-center gap-2.5 py-1.5">
            <div className="w-8 h-8 rounded-[6px] border border-border-default shrink-0" style={{ backgroundColor: `var(${cssVar})` }} />
            <span className="text-xs font-mono text-text-secondary">{cssVar}</span>
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

// ─── Stories ─────────────────────────────────────────────────────────────────

export const Primitives: Story = {
    render: () => (
        <div className="max-w-[960px] p-8">
            {PRIMITIVE_RAMPS.map(({ label, steps }) => (
                <div key={label} className="mb-8">
                    <h2 className="story-section-heading mb-2.5">{label}</h2>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
                        {steps.map(({ step, cssVar }) => (
                            <RampSwatch key={step} step={step} cssVar={cssVar} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
};

export const Semantic: Story = {
    render: () => (
        <div className="max-w-[1200px] p-8">
            {SEMANTIC_GROUPS.map(({ label, vars }) => (
                <div key={label} className="mb-8">
                    <h2 className="story-section-heading mb-2 capitalize">{label}</h2>
                    <div className="grid grid-cols-3 gap-x-6 p-3 rounded-lg border border-border-default bg-surface-panel">
                        {vars.map((v) => (
                            <Swatch key={v} cssVar={v} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
};
