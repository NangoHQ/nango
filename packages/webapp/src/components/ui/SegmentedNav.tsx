import { Link } from 'react-router-dom';

import type { LucideIcon } from 'lucide-react';
import type { To } from 'react-router-dom';

export interface SegmentedNavOption<T extends string> {
    value: T;
    label: string;
    to: To;
    Icon?: LucideIcon;
}

interface SegmentedNavProps<T extends string> {
    value: T;
    options: SegmentedNavOption<T>[];
    'aria-label': string;
    state?: unknown;
}

export function SegmentedNav<T extends string>({ value, options, 'aria-label': ariaLabel, state }: SegmentedNavProps<T>) {
    return (
        <nav aria-label={ariaLabel} className="inline-flex h-8 items-center gap-0.5 rounded-ds-md border border-border-default bg-surface-canvas p-0.5">
            {options.map(({ value: optionValue, label, to, Icon }) => (
                <Link
                    key={optionValue}
                    to={to}
                    state={state}
                    aria-current={optionValue === value ? 'page' : undefined}
                    className="inline-flex h-full items-center gap-1.5 rounded-ds-sm border border-transparent px-2.5 text-body-medium-medium text-text-secondary transition-colors hover:text-text-strong focus-default aria-[current=page]:border-border-default aria-[current=page]:bg-surface-panel aria-[current=page]:text-text-strong aria-[current=page]:shadow-[0_1px_2px_rgba(0,0,0,0.04)] [&_svg]:size-4 [&_svg]:shrink-0"
                >
                    {Icon && <Icon />}
                    {label}
                </Link>
            ))}
        </nav>
    );
}
