import { forwardRef } from 'react';
import { cn } from '../../utils/utils';

const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
    <table ref={ref} className={cn('w-full caption-bottom text-sm border-separate border-spacing-0', className)} {...props} />
));
Table.displayName = 'Table';

const Header = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('text-white', className)} {...props} />
));
Header.displayName = 'Header';

const Body = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('text-gray-400 [&_tr:last-child]:border-0', className)} {...props} />
));
Body.displayName = 'Body';

const Footer = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn('bg-muted/50 font-medium [&>tr]:last:border-b-0', className)} {...props} />
));
Footer.displayName = 'Footer';

const Row = forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => (
    <tr
        ref={ref}
        className={cn(
            'text-sm transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted border-transparent border-b border-b-active-gray hover:bg-row-hover hover:text-white',
            className
        )}
        {...props}
    />
));
Row.displayName = 'Row';

const Head = forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
    <th
        ref={ref}
        className={cn(
            'bg-active-gray first-of-type:rounded-l last-of-type:rounded-r px-3 py-1 pt-1.5 text-xs leading-5 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
            className
        )}
        {...props}
    />
));
Head.displayName = 'Head';

const Cell = forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
    <td ref={ref} className={cn('px-3 py-2.5 align-middle [&:has([role=checkbox])]:pr-0', className)} {...props} />
));
Cell.displayName = 'Cell';

const Caption = forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(({ className, ...props }, ref) => (
    <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
));
Caption.displayName = 'Caption';

export { Table, Header, Body, Footer, Head, Row, Cell, Caption };
