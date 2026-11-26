import { ArrowUpRight } from 'lucide-react';

import { CopyButton, LinkButton } from '@nangohq/design-system';

import { cn } from '@/utils/utils';

const FUNCTIONS_GUIDE_URL = 'https://nango.dev/docs/guides/platform/functions/functions-guide';

interface FunctionListColumn {
    header: string;
    className?: string;
}

interface FunctionListProps {
    title: string;
    columns?: FunctionListColumn[];
    footer: string;
    empty?: React.ReactNode;
    children: React.ReactNode;
}

export const FunctionList: React.FC<FunctionListProps> = ({ title, columns = [], footer, empty, children }) => (
    <div className="overflow-hidden rounded-ds-md border-ds-hairline border-border-default bg-surface-panel">
        <table role="grid" className="w-full">
            <thead>
                <tr className="border-b-ds-hairline border-border-default bg-surface-canvas">
                    <ColumnHead>{title}</ColumnHead>
                    {columns.map((column) => (
                        <ColumnHead key={column.header} className={column.className}>
                            {column.header}
                        </ColumnHead>
                    ))}
                </tr>
            </thead>
            <tbody>
                {empty ? (
                    <tr>
                        <td colSpan={columns.length + 1}>{empty}</td>
                    </tr>
                ) : (
                    children
                )}
            </tbody>
            <tfoot>
                <tr className="border-t-ds-hairline border-border-default">
                    <td colSpan={columns.length + 1} className="px-3 py-2 type-text-regular-xs text-text-muted">
                        {footer}
                    </td>
                </tr>
            </tfoot>
        </table>
    </div>
);

const ColumnHead: React.FC<{ className?: string | undefined; children: string }> = ({ className, children }) => (
    <th className={cn('px-3 py-2 text-left type-label-xs uppercase text-text-muted', className)}>{children}</th>
);

interface FunctionListRowProps {
    name: string;
    description?: string | undefined;
    selected: boolean;
    onSelect: () => void;
    children?: React.ReactNode;
}

export const FunctionListRow: React.FC<FunctionListRowProps> = ({ name, description, selected, onSelect, children }) => (
    <tr
        tabIndex={0}
        aria-selected={selected}
        onClick={onSelect}
        onKeyDown={(event) => {
            // Enter on the row's own copy or switch button must keep doing that button's job.
            if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
                return;
            }
            event.preventDefault();
            onSelect();
        }}
        className={cn(
            'group/function-row cursor-pointer border-b-ds-hairline border-border-default transition-colors last:border-b-0 focus-inset',
            selected ? 'bg-surface-canvas' : 'hover:bg-state-hover'
        )}
    >
        <td className={cn('max-w-0 py-2 pr-3', selected ? 'border-l-ds-2 border-l-interactive-selected-fill pl-2.5' : 'pl-3')}>
            <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-1">
                    <span className="truncate type-code-medium-md text-text-strong">{name}</span>
                    <span className="flex shrink-0 opacity-0 transition-opacity group-focus-within/function-row:opacity-100 group-hover/function-row:opacity-100">
                        <CopyButton size="sm" inline value={name} />
                    </span>
                </div>
                {description && <span className="truncate type-text-regular-xs text-text-secondary">{description}</span>}
            </div>
        </td>
        {children}
    </tr>
);

export const FunctionListCell: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
    <td className={cn('px-3 py-2', className)}>{children}</td>
);

interface FunctionListNoMatchesProps {
    query: string;
    noun: string;
    onClear: () => void;
}

export const FunctionListNoMatches: React.FC<FunctionListNoMatchesProps> = ({ query, noun, onClear }) => (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <span className="type-text-medium-sm text-text-strong">
            No {noun} match “{query}”
        </span>
        <span className="type-text-regular-xs text-text-secondary">Try another word, or build your own.</span>
        <div className="flex items-center gap-4 pt-1">
            <LinkButton size="lg" onClick={onClear}>
                Clear search
            </LinkButton>
            <LinkButton asChild size="lg">
                <a href={FUNCTIONS_GUIDE_URL} target="_blank" rel="noreferrer">
                    Build your own <ArrowUpRight />
                </a>
            </LinkButton>
        </div>
    </div>
);
