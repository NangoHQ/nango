import type { SearchLogsState } from '@nangohq/types';

export interface MultiSelectArgs {
    label: string;
    options: { name: string; value: SearchLogsState }[];
    selected: SearchLogsState[];
    onChange: (selected: SearchLogsState[]) => void;
}

export const MultiSelect: React.FC<MultiSelectArgs> = ({ label, options, selected }) => {
    return (
        <div className="rounded border border-zinc-900">
            <div className="text-white text-xs">{label}</div>
        </div>
    );
};
