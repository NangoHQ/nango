import { Layers } from 'lucide-react';

import { DIMENSION_LABELS } from '../usageBreakdown';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';

import type { AnyBreakdownDimension } from '../usageBreakdown';

const NONE = 'none';

interface BreakdownControlsProps {
    /** Dimensions this metric can be broken down by. */
    dimensions: readonly AnyBreakdownDimension[];
    /** Currently selected dimension, or null for "No breakdown". */
    dimension: AnyBreakdownDimension | null;
    onChange: (dimension: AnyBreakdownDimension | null) => void;
    /** Show the "Apply to all" button when another applicable panel differs. */
    canApplyToAll: boolean;
    onApplyToAll: () => void;
}

/** Header controls for a usage panel: the breakdown-dimension dropdown plus optional fan-out. */
export const BreakdownControls: React.FC<BreakdownControlsProps> = ({ dimensions, dimension, onChange, canApplyToAll, onApplyToAll }) => (
    <div className="flex items-center gap-2">
        {canApplyToAll && (
            <button
                type="button"
                onClick={onApplyToAll}
                className="flex items-center gap-1 text-text-tertiary text-body-small-regular hover:text-text-primary"
                title="Apply this selection to every applicable metric"
            >
                <Layers className="size-3.5" />
                Apply to all
            </button>
        )}
        <Select value={dimension ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : (v as AnyBreakdownDimension))}>
            <SelectTrigger size="sm">
                <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
                <SelectItem value={NONE}>No breakdown</SelectItem>
                {dimensions.map((d) => (
                    <SelectItem key={d} value={d}>
                        {DIMENSION_LABELS[d]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    </div>
);
