import { Check } from 'lucide-react';
import { Fragment } from 'react';

import { cn } from '@/utils/utils';

export type MfaStep = 'scan' | 'save' | 'done';

const STEPS: { id: MfaStep; label: string }[] = [
    { id: 'scan', label: 'Scan and verify' },
    { id: 'save', label: 'Save codes' },
    { id: 'done', label: 'Done' }
];

export const MfaStepper: React.FC<{ current: MfaStep }> = ({ current }) => {
    const currentIndex = STEPS.findIndex((step) => step.id === current);

    return (
        <div className="flex items-start justify-center">
            {STEPS.map((step, index) => {
                const isCompleted = index < currentIndex;
                const isActive = index === currentIndex;
                const isLast = index === STEPS.length - 1;

                return (
                    <Fragment key={step.id}>
                        <div className="flex flex-col items-center gap-2">
                            <div
                                className={cn(
                                    'flex size-5 items-center justify-center rounded-full border transition-colors',
                                    isCompleted && 'border-interactive-primary text-interactive-primary',
                                    isActive && isLast && 'border-interactive-primary bg-interactive-primary text-text-on-brand',
                                    isActive && !isLast && 'border-interactive-primary',
                                    !isCompleted && !isActive && 'border-border-default'
                                )}
                            >
                                {isCompleted || (isActive && isLast) ? (
                                    <Check className="size-3" />
                                ) : isActive ? (
                                    <div className="size-2 rounded-full bg-interactive-primary" />
                                ) : null}
                            </div>
                            <span className={cn('whitespace-nowrap text-ds-xs', isActive || isCompleted ? 'text-text-default' : 'text-text-muted')}>
                                {step.label}
                            </span>
                        </div>
                        {!isLast && <div className={cn('mt-2.5 h-px min-w-12 flex-1', isCompleted ? 'bg-interactive-primary' : 'bg-border-default')} />}
                    </Fragment>
                );
            })}
        </div>
    );
};
