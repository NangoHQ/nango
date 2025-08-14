import { IconChecks } from '@tabler/icons-react';
import React from 'react';

import { cn } from '../utils/utils.js';

import type { Icon } from '@tabler/icons-react';
import type { HTMLAttributes } from 'react';

export interface Step {
    id: string;
    content: React.ReactNode;
    icon: Icon;
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
                    <div
                        key={step.id}
                        className="flex scroll-mt-12"
                        {...(isBlocked && {
                            onClick: (e: React.MouseEvent) => e.stopPropagation(),
                            onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
                            onKeyDown: (e: React.KeyboardEvent) => e.preventDefault(),
                            tabIndex: -1,
                            'aria-disabled': true
                        })}
                    >
                        {/* Left side - Steps and connectors */}
                        <div className="flex flex-col items-center mr-5">
                            {/* Step */}
                            <div
                                className={cn(
                                    'flex-shrink-0 flex items-center justify-center w-10 h-10 bg-dark-glow rounded-md p-[1px]',
                                    isCurrent && 'bg-grayscale-10',
                                    isDone && 'bg-success-4'
                                )}
                            >
                                <div className="flex items-center justify-center w-full h-full bg-dark-glow-reverse rounded-md">
                                    {isDone ? <IconChecks className="w-5 h-5 text-success-4" /> : <IconComponent className="w-5 h-5 text-text-secondary" />}
                                </div>
                            </div>

                            {/* Connector line */}
                            {!isLast && <div className={cn('w-[1px] h-full bg-grayscale-5', isCurrent && 'bg-grayscale-10', isDone && 'bg-success-4')} />}
                        </div>

                        {/* Right side - Content */}
                        <div className={cn('flex-1 pb-20 max-w-full opacity-100', isLast && 'pb-0', isBlocked && 'opacity-50 pointer-events-none')}>
                            {step.content}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
