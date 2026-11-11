import { SegmentedControl, SegmentedControlItem } from '@nangohq/design-system';

interface BinaryToggleProps {
    value: boolean;
    onChange: (value: boolean) => void;
    offLabel: string;
    onLabel: string;
    disabled?: boolean;
    /** Layout only (margin, width): it wraps the control. */
    className?: string;
    /** Names the choice for assistive tech. Defaults to "<offLabel> or <onLabel>". */
    'aria-label'?: string;
}

/** Two-option design-system `SegmentedControl` bound to a boolean (off = first option). */
export const BinaryToggle: React.FC<BinaryToggleProps> = ({ value, onChange, offLabel, onLabel, disabled = false, className, 'aria-label': ariaLabel }) => {
    return (
        <div className={className}>
            <SegmentedControl
                aria-label={ariaLabel ?? `${offLabel} or ${onLabel}`}
                value={value ? 'on' : 'off'}
                onValueChange={(next) => onChange(next === 'on')}
                disabled={disabled}
            >
                <SegmentedControlItem value="off">{offLabel}</SegmentedControlItem>
                <SegmentedControlItem value="on">{onLabel}</SegmentedControlItem>
            </SegmentedControl>
        </div>
    );
};
