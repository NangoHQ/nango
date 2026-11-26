import { cn } from '@/utils/utils';

export interface FunctionTypeTab<T extends string> {
    value: T;
    label: string;
    count: number | undefined;
}

interface FunctionTypeTabsProps<T extends string> {
    tabs: FunctionTypeTab<T>[];
    value: T;
    onChange: (value: T) => void;
}

export function FunctionTypeTabs<T extends string>({ tabs, value, onChange }: FunctionTypeTabsProps<T>) {
    return (
        <div role="group" aria-label="Function type" className="flex items-center gap-1">
            {tabs.map((tab) => {
                const selected = tab.value === value;
                const empty = tab.count === 0;
                return (
                    <button
                        key={tab.value}
                        type="button"
                        aria-pressed={selected}
                        disabled={empty}
                        onClick={() => onChange(tab.value)}
                        className={cn(
                            'flex h-6 items-center gap-1.5 rounded-ds-sm px-2 type-text-medium-sm transition-colors focus-default',
                            empty && 'cursor-not-allowed text-text-disabled',
                            !empty && selected && 'cursor-pointer bg-status-info-bg text-status-info-text',
                            !empty && !selected && 'cursor-pointer text-text-default hover:bg-state-hover'
                        )}
                    >
                        {tab.label}
                        {tab.count != null && <span className="type-code-regular-xs">{tab.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}
