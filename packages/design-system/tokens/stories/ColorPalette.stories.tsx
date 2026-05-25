import { entries, isLeaf, tokens } from '../types';
import { capitalize, isFlatGroup, leaves, toKebab } from './utils';

import type { TokenGroup } from '../types';
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Tokens/Color Palette',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Semantic data ────────────────────────────────────────────────────────────

const SEMANTIC_GROUPS = entries(tokens['Semantic/Light'] ?? {}).flatMap(([label, group]) => {
    if (isLeaf(group)) return [];
    const vars = [...leaves(group, [toKebab(label)])].filter(({ leaf }) => leaf.$type === 'color').map(({ path }) => '--' + path.map(toKebab).join('-'));
    return vars.length ? [{ label, vars }] : [];
});

// ─── Primitive data ───────────────────────────────────────────────────────────

interface Ramp {
    label: string;
    swatches: { step: string; cssVar: string }[];
}

const FAMILY_ORDER = ['mono', 'neutral', 'alpha', 'brand', 'info', 'success', 'warning', 'danger', 'accent'];
const cssVar = (...parts: string[]) => '--ds-color-' + parts.map(toKebab).join('-');

/**
 * Each top-level family in Primitives.color is one of three shapes:
 *   - Flat       (e.g. neutral, brand): leaf children                  → one ramp, steps from leaf keys
 *   - Singletons (e.g. accent):         subgroups each with one step   → one ramp, steps labeled by subgroup
 *   - Nested     (e.g. alpha):          subgroups with multiple steps  → one ramp per subgroup
 */
function buildRamp(name: string, family: TokenGroup): Ramp[] {
    if (isFlatGroup(family)) {
        return [{ label: capitalize(name), swatches: entries(family).map(([step]) => ({ step, cssVar: cssVar(name, step) })) }];
    }

    const subgroups = entries(family).filter((e): e is [string, TokenGroup] => !isLeaf(e[1]));
    const allSingletons = subgroups.every(([, sub]) => entries(sub).length === 1);

    if (allSingletons) {
        return [
            {
                label: capitalize(name),
                swatches: subgroups.map(([sub, group]) => ({ step: sub, cssVar: cssVar(name, sub, entries(group)[0][0]) }))
            }
        ];
    }

    return subgroups.map(([sub, group]) => ({
        label: `${capitalize(name)} · ${capitalize(sub)}`,
        swatches: entries(group).map(([step]) => ({ step, cssVar: cssVar(name, sub, step) }))
    }));
}

const PRIMITIVE_RAMPS: Ramp[] = entries(tokens.Primitives?.color ?? {})
    .filter(([k, v]) => k !== 'transparent' && !isLeaf(v))
    .sort(([a], [b]) => (FAMILY_ORDER.indexOf(a) + 1 || 999) - (FAMILY_ORDER.indexOf(b) + 1 || 999))
    .flatMap(([name, family]) => buildRamp(name, family as TokenGroup));

// ─── Stories ─────────────────────────────────────────────────────────────────

export const Primitives: Story = {
    render: () => (
        <div className="max-w-[960px] p-8">
            {PRIMITIVE_RAMPS.map(({ label, swatches }) => (
                <div key={label} className="mb-8">
                    <h2 className="story-section-heading mb-2.5">{label}</h2>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${swatches.length}, 1fr)` }}>
                        {swatches.map(({ step, cssVar }) => (
                            <div key={step} className="flex flex-col gap-1 items-center">
                                <div className="w-full h-10 rounded border border-border-muted" style={{ backgroundColor: `var(${cssVar})` }} />
                                <span className="text-[10px] text-text-secondary font-mono">{step}</span>
                            </div>
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
                            <div key={v} className="flex items-center gap-2.5 py-1.5">
                                <div className="w-8 h-8 rounded-[6px] border border-border-default shrink-0" style={{ backgroundColor: `var(${v})` }} />
                                <span className="text-xs font-mono text-text-secondary">{v}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
};
