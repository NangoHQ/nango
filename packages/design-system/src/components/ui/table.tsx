import { ArrowDown, ArrowUp } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/cn';

type TableVariant = 'default' | 'bordered';

const TableContext = React.createContext<{ variant: TableVariant; grid: boolean }>({ variant: 'default', grid: false });

export interface TableProps extends React.ComponentProps<'table'> {
    variant?: TableVariant;
    /** A `grid-template-columns` value. Setting it switches rows from table layout to grid layout. */
    columns?: string;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(({ className, style, variant = 'default', columns, ...props }, ref) => {
    const grid = columns !== undefined;
    const context = React.useMemo(() => ({ variant, grid }), [variant, grid]);
    return (
        <TableContext.Provider value={context}>
            <table
                ref={ref}
                data-slot="table"
                data-variant={variant}
                className={cn(
                    'w-full border-separate border-spacing-0 text-left text-text-default',
                    grid && 'grid',
                    variant === 'bordered' && 'overflow-hidden rounded-ds-sm border-ds-1 border-border-muted',
                    className
                )}
                style={grid ? { ...style, ['--table-columns' as string]: columns } : style}
                {...props}
            />
        </TableContext.Provider>
    );
});
Table.displayName = 'Table';

const HeaderContext = React.createContext(false);

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.ComponentProps<'thead'>>(({ className, ...props }, ref) => {
    const { variant, grid } = React.useContext(TableContext);
    return (
        <HeaderContext.Provider value={true}>
            <thead ref={ref} data-slot="table-header" className={cn(grid && 'grid', variant === 'default' && 'sticky top-0 z-10', className)} {...props} />
        </HeaderContext.Provider>
    );
});
TableHeader.displayName = 'TableHeader';

export interface TableBodyProps extends React.ComponentProps<'tbody'> {
    /** The virtualizer's total size. It doesn't make the body scroll. */
    height?: number;
}

const TableBody = React.forwardRef<HTMLTableSectionElement, TableBodyProps>(({ className, style, height, ...props }, ref) => {
    const { grid } = React.useContext(TableContext);
    return (
        <tbody
            ref={ref}
            data-slot="table-body"
            className={cn(grid && 'relative grid', className)}
            style={height === undefined ? style : { ...style, height }}
            {...props}
        />
    );
});
TableBody.displayName = 'TableBody';

export interface TableRowProps extends React.ComponentProps<'tr'> {
    interactive?: boolean;
    selected?: boolean;
    /** Runs once while set; it must be cleared before it can run again. */
    flash?: boolean;
    offset?: number;
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
    ({ className, style, interactive = false, selected = false, flash = false, offset, ...props }, ref) => {
        const { variant, grid } = React.useContext(TableContext);
        const inHeader = React.useContext(HeaderContext);
        return (
            <tr
                ref={ref}
                data-slot="table-row"
                data-selected={selected || undefined}
                data-flash={flash || undefined}
                className={cn(
                    'group/row',
                    grid && 'grid w-full grid-cols-(--table-columns)',
                    grid && !inHeader && variant === 'bordered' && 'border-b border-border-muted last:border-b-0',
                    grid && selected && 'shadow-[inset_2px_0_0_var(--color-text-strong)]',
                    offset !== undefined && 'absolute top-0 left-0',
                    interactive && 'cursor-pointer outline-none hover:bg-state-hover',
                    interactive && grid && 'focus-visible:shadow-[inset_2px_0_0_var(--color-text-strong)]',
                    selected && 'bg-state-selected hover:bg-state-selected',
                    flash && 'motion-safe:animate-row-flash',
                    className
                )}
                style={offset === undefined ? style : { ...style, transform: `translateY(${offset}px)` }}
                {...props}
            />
        );
    }
);
TableRow.displayName = 'TableRow';

type CellAlign = 'start' | 'end';

function cellClasses(variant: TableVariant, grid: boolean, align: CellAlign) {
    return cn(
        'min-w-0 whitespace-nowrap',
        grid ? 'flex items-center' : 'align-middle',
        align === 'end' && (grid ? 'justify-end text-right' : 'text-right'),
        variant === 'default' ? 'px-2.5 first:pl-5 last:pr-5' : 'px-1 first:pl-3 last:pr-3'
    );
}

export interface TableHeadProps extends Omit<React.ComponentProps<'th'>, 'align'> {
    align?: CellAlign;
}

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(({ className, align = 'start', ...props }, ref) => {
    const { variant, grid } = React.useContext(TableContext);
    return (
        <th
            ref={ref}
            data-slot="table-head"
            className={cn(
                cellClasses(variant, grid, align),
                'font-normal text-text-secondary bg-surface-panel-muted',
                variant === 'default' ? 'h-8 border-b border-border-default type-text-regular-xs' : 'h-7 border-b border-border-muted type-text-regular-xs',
                className
            )}
            {...props}
        />
    );
});
TableHead.displayName = 'TableHead';

export interface TableCellProps extends Omit<React.ComponentProps<'td'>, 'align'> {
    fullWidth?: boolean;
    align?: CellAlign;
}

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(({ className, fullWidth = false, align = 'start', colSpan, ...props }, ref) => {
    const { variant, grid } = React.useContext(TableContext);
    return (
        <td
            ref={ref}
            data-slot="table-cell"
            colSpan={fullWidth && !grid ? 1000 : colSpan}
            className={cn(
                cellClasses(variant, grid, align),
                'type-text-regular-sm',
                variant === 'default' ? 'min-h-9' : 'min-h-8',
                !grid &&
                    'group-focus-visible/row:first:shadow-[inset_2px_0_0_var(--color-text-strong)] group-data-selected/row:first:shadow-[inset_2px_0_0_var(--color-text-strong)]',
                !grid && variant === 'default' && 'h-9',
                !grid && variant === 'bordered' && 'h-8 border-b border-border-muted group-last/row:border-b-0',
                fullWidth && 'col-span-full block whitespace-normal',
                className
            )}
            {...props}
        />
    );
});
TableCell.displayName = 'TableCell';

export interface TableSortButtonProps extends Omit<React.ComponentProps<'button'>, 'children'> {
    label: string;
    direction: 'asc' | 'desc';
    /** What each direction means to a reader, such as "oldest first". */
    directionLabels: { asc: string; desc: string };
}

const TableSortButton = React.forwardRef<HTMLButtonElement, TableSortButtonProps>(({ className, label, direction, directionLabels, ...props }, ref) => {
    const next = direction === 'asc' ? 'desc' : 'asc';
    return (
        <button
            ref={ref}
            type="button"
            data-slot="table-sort-button"
            aria-label={`${label}, ${directionLabels[direction]}. Show ${directionLabels[next]}`}
            className={cn(
                'focus-default -mx-1 flex w-fit cursor-pointer items-center gap-1 rounded-ds-xs px-1 text-text-strong outline-none hover:bg-state-hover',
                className
            )}
            {...props}
        >
            {label}
            {direction === 'asc' ? (
                <ArrowUp aria-hidden className="size-3 text-icon-secondary" />
            ) : (
                <ArrowDown aria-hidden className="size-3 text-icon-secondary" />
            )}
        </button>
    );
});
TableSortButton.displayName = 'TableSortButton';

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableSortButton };
