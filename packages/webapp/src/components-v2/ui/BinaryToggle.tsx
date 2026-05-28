import * as React from 'react';

import { InfoTooltip } from '@/components-v2/InfoTooltip';
import { cn } from '@/utils/utils';

interface BinaryToggleProps {
    value: boolean;
    onChange: (value: boolean) => void;
    offLabel: string;
    onLabel: string;
    offTooltip?: React.ReactNode;
    onTooltip?: React.ReactNode;
    disabled?: boolean;
    className?: string;
}

export const BinaryToggle: React.FC<BinaryToggleProps> = ({ value, onChange, offLabel, onLabel, offTooltip, onTooltip, disabled = false, className }) => {
    const handleToggle = () => {
        if (!disabled) {
            onChange(!value);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
        }
    };

    return (
        <div
            role="switch"
            aria-checked={value}
            tabIndex={disabled ? -1 : 0}
            onClick={handleToggle}
            onKeyDown={handleKeyDown}
            className={cn('inline-flex rounded-lg bg-bg-surface p-1 w-fit', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer', className)}
        >
            <div
                className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-body-small-medium rounded-md transition-all',
                    !value ? 'bg-bg-elevated text-text-primary shadow-sm' : 'text-text-secondary'
                )}
            >
                <span>{offLabel}</span>
                {offTooltip && <InfoTooltip>{offTooltip}</InfoTooltip>}
            </div>
            <div
                className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-body-small-medium rounded-md transition-all',
                    value ? 'bg-bg-elevated text-text-primary shadow-sm' : 'text-text-secondary'
                )}
            >
                <span>{onLabel}</span>
                {onTooltip && <InfoTooltip>{onTooltip}</InfoTooltip>}
            </div>
        </div>
    );
};
