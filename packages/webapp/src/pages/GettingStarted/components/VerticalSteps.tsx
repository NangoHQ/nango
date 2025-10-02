import React from 'react';

import { cn } from '../../../utils/utils.js';

import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes } from 'react';

export interface Step {
    id: string;
    content: React.ReactNode;
    icon: LucideIcon;
    branded?: boolean;
}

export type VerticalStepsProps = {
    steps: Step[];
    currentStep: number;
} & HTMLAttributes<HTMLDivElement>;

export default function VerticalSteps({ steps, currentStep, ...props }: VerticalStepsProps) {
    return (
        <div {...props} className={cn('flex flex-col', props.className)}>
            {steps.map((step, index) => {
                const isDone = index < currentStep;
                const isCurrent = index === currentStep;
                const isBlocked = index > currentStep;
                const isLast = index === steps.length - 1;
                const IconComponent = step.icon;

                return (
                    <div key={step.id} className="flex flex-col w-full">
                        <div className="flex flex-row">
                            <div className={cn('mr-10 w-px h-auto bg-border-default', isCurrent && 'bg-border-strong', isDone && 'bg-border-brand')} />

                            <div
                                className={cn(
                                    'flex-1 p-6 pl-3 flex flex-row gap-5 bg-bg-elevated rounded border border-border-muted min-w-0',
                                    step.branded && 'bg-brand-700/40 border-none',
                                    isBlocked && 'opacity-50 pointer-events-none'
                                )}
                            >
                                <div className="size-10 flex justify-center items-center bg-bg-surface border border-border-muted rounded">
                                    <IconComponent className={cn('size-4.5 text-text-primary', isDone && 'text-brand-500')} />
                                </div>
                                {step.content}
                            </div>
                        </div>
                        {!isLast && <div className={cn('mr-10 h-10 bg-border-default w-px', isDone && 'bg-border-brand', isLast && 'opacity-0')} />}
                    </div>
                );
            })}
        </div>
    );
}
