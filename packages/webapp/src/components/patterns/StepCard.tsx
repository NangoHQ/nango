import { cn } from '@/utils/utils';

import type { LucideIcon } from 'lucide-react';

export type StepCardState = 'upcoming' | 'current' | 'done';

const STATE_LABEL: Record<StepCardState, string> = {
    upcoming: 'Upcoming',
    current: 'Current step',
    done: 'Done'
};

/**
 * Numbered flow of step cards joined by a progress rail. The rail is solid up to the current step.
 */
export const StepList: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
    return (
        <ol aria-label={label} className="flex flex-col gap-3 pl-6 max-sm:pl-4">
            {children}
        </ol>
    );
};

interface StepCardProps {
    state: StepCardState;
    icon: LucideIcon;
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
}

export const StepCard: React.FC<StepCardProps> = ({ state, icon, title, description, children }) => {
    return (
        <StepItem state={state}>
            <div
                className={cn(
                    'grid grid-cols-[32px_minmax(0,1fr)] gap-4 rounded-ds-md border-ds-hairline p-5 transition-[background-color,border-color,box-shadow] max-sm:grid-cols-1 max-sm:gap-3 max-sm:p-4',
                    state === 'current' && 'border-border-strong bg-surface-raised shadow-container-panel',
                    state === 'done' && 'border-border-default bg-surface-panel',
                    state === 'upcoming' && 'border-border-default bg-transparent'
                )}
            >
                <StepTile state={state} icon={icon} />
                <div className="flex min-w-0 flex-col gap-3.5">
                    <div className="flex flex-col gap-0.5 pt-px">
                        <h3 className={cn('type-text-medium-md', state === 'upcoming' ? 'text-text-secondary' : 'text-text-strong')}>
                            <span className="sr-only">{STATE_LABEL[state]}: </span>
                            {title}
                        </h3>
                        {description && (
                            <p className={cn('type-text-regular-sm', state === 'upcoming' ? 'text-text-muted' : 'text-text-secondary')}>{description}</p>
                        )}
                    </div>
                    {children}
                </div>
            </div>
        </StepItem>
    );
};

/**
 * A finished step folded into one line, keeping the actions someone may still need.
 */
export const CompactStepCard: React.FC<{ icon: LucideIcon; title: React.ReactNode; summary?: React.ReactNode; actions?: React.ReactNode }> = ({
    icon,
    title,
    summary,
    actions
}) => {
    return (
        <StepItem state="done">
            <div className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-4 rounded-ds-md border-ds-hairline border-border-default bg-surface-panel px-5 py-3.5 max-sm:px-4">
                <StepTile state="done" icon={icon} />
                <div className="flex min-h-8 flex-wrap items-center gap-2.5">
                    <h3 className="type-text-medium-md text-text-strong">
                        <span className="sr-only">{STATE_LABEL.done}: </span>
                        {title}
                    </h3>
                    {summary && <span className="type-text-regular-sm text-text-muted">{summary}</span>}
                    {actions && <div className="ml-auto flex flex-wrap items-center gap-1">{actions}</div>}
                </div>
            </div>
        </StepItem>
    );
};

const StepItem: React.FC<{ state: StepCardState; children: React.ReactNode }> = ({ state, children }) => {
    return (
        <li
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
                'relative',
                // The rail: a line from this card down to the next one, solid where the flow has reached.
                'before:absolute before:top-0 before:-bottom-3 before:-left-6 before:w-px last:before:bottom-0 max-sm:before:-left-4',
                state === 'upcoming' ? 'before:bg-border-default' : 'before:bg-text-secondary',
                state === 'current' &&
                    'before:bottom-1/2 last:before:bottom-1/2 after:absolute after:top-1/2 after:-bottom-3 after:-left-6 after:w-px after:bg-border-default last:after:bottom-0 max-sm:after:-left-4'
            )}
        >
            {children}
        </li>
    );
};

const StepTile: React.FC<{ state: StepCardState; icon: LucideIcon }> = ({ state, icon: Icon }) => {
    return (
        <div
            className={cn(
                'grid size-8 place-items-center rounded-ds-md border-ds-hairline',
                state === 'upcoming' && 'border-border-strong bg-surface-panel-muted text-icon-secondary',
                state === 'current' && 'border-status-info-border bg-status-info-bg text-icon-brand',
                state === 'done' && 'border-status-success-border bg-status-success-bg text-status-success-icon'
            )}
        >
            <Icon className="size-4" aria-hidden />
        </div>
    );
};
