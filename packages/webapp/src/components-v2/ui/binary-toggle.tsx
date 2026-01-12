import { IconHelpCircle } from '@tabler/icons-react';
import * as React from 'react';

import { SimpleTooltip } from '@/components/SimpleTooltip';
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
                    'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                    !value ? 'bg-bg-elevated text-text-primary shadow-sm' : 'text-text-secondary'
                )}
            >
                <span>{offLabel}</span>
                {offTooltip && (
                    <SimpleTooltip side="top" align="center" tooltipContent={<p className="text-s">{offTooltip}</p>}>
                        <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                    </SimpleTooltip>
                )}
            </div>
            <div
                className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                    value ? 'bg-bg-elevated text-text-primary shadow-sm' : 'text-text-secondary'
                )}
            >
                <span>{onLabel}</span>
                {onTooltip && (
                    <SimpleTooltip side="top" align="center" tooltipContent={<p className="text-s">{onTooltip}</p>}>
                        <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                    </SimpleTooltip>
                )}
            </div>
        </div>
    );
};
