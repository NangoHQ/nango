import { entries, isLeaf, tokens } from '../types';
import { capitalize, toKebab } from './utils';

import type { TokenGroup } from '../types';
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Tokens/Color Palette',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Recursively collect CSS variable names for all color leaf tokens in a group. */
function collectColorVars(group: TokenGroup, path: string[]): string[] {
    return entries(group).flatMap(([k, node]) => {
        const next = [...path, toKebab(k)];
        if (isLeaf(node)) return node.$type === 'color' ? ['--' + next.join('-')] : [];
        return collectColorVars(node, next);
    });
}

// ─── Semantic data ────────────────────────────────────────────────────────────

const SEMANTIC_GROUPS = entries(tokens['Semantic/Light'])
    .map(([k, v]) => ({ label: k, vars: isLeaf(v) ? [] : collectColorVars(v, [toKebab(k)]) }))
    .filter((g) => g.vars.length > 0);

// ─── Primitive data ───────────────────────────────────────────────────────────

interface Ramp {
    label: string;
    steps: { step: string; cssVar: string }[];
}

const COLOR_ORDER = ['mono', 'neutral', 'alpha', 'brand', 'info', 'success', 'warning', 'danger', 'accent'];

/**
 * Build display ramps from the Primitives color group.
 * Three token structures are handled:
 *   - Flat ramp (neutral, brand …): direct leaf children → one row, step = token key
 *   - accent-style nested: each sub-group has exactly one step → one combined row, sub-names become step labels
 *   - alpha-style nested: each sub-group has multiple steps → one row per sub-group
 */
function collectRamps(colorGroup: TokenGroup): Ramp[] {
    return entries(colorGroup)
        .filter(([k]) => k !== 'transparent')
        .sort(([a], [b]) => (COLOR_ORDER.indexOf(a) + 1 || 999) - (COLOR_ORDER.indexOf(b) + 1 || 999))
        .flatMap(([name, group]) => {
            if (isLeaf(group)) return [];
            const children = entries(group);

            // Flat ramp (neutral, brand, …): children are all leaf tokens
            if (children.every(([, v]) => isLeaf(v))) {
                return [{ label: capitalize(name), steps: children.map(([step]) => ({ step, cssVar: `--ds-color-${toKebab(name)}-${step}` })) }];
            }

            const subRamps = children
                .filter((e): e is [string, TokenGroup] => !isLeaf(e[1]))
                .map(([subName, subGroup]) => ({ subName, steps: entries(subGroup) }));

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

const PRIMITIVE_RAMPS = collectRamps(tokens.Primitives.color);

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
