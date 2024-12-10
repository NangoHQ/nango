import type React from 'react';
import { forwardRef } from 'react';
import { cn } from '../../utils/utils';

const Table = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
    <table ref={ref} className={cn('w-full caption-bottom text-s border-separate border-spacing-0', className)} {...props} />
));
Table.displayName = 'Table';

const Header = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('text-grayscale-100 ', className)} {...props} />
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
            'text-s transition-colors data-[state=selected]:bg-muted border-transparent border-b border-b-active-gray hover:bg-grayscale-1000 hover:text-white',
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
            'bg-grayscale-900 first-of-type:rounded-l last-of-type:rounded-r px-4 py-2 pt-1.5 text-s text-left align-middle font-semibold [&:has([role=checkbox])]:pr-0',
            className
        )}
        {...props}
    />
));
Head.displayName = 'Head';

const Cell = forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement> & { bordered?: boolean }>(
    ({ className, bordered, ...props }, ref) => (
        <td
            ref={ref}
            className={cn('px-3 py-2.5 align-middle [&:has([role=checkbox])]:pr-0', bordered && 'border-b border-b-active-gray', className)}
            {...props}
        />
    )
);
Cell.displayName = 'Cell';

const Caption = forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(({ className, ...props }, ref) => (
    <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
));
Caption.displayName = 'Caption';

const Empty: React.FC<{ children: React.ReactNode; colSpan?: number }> = ({ children, colSpan }) => {
    return (
        <Row className="hover:bg-transparent">
            <Cell className="h-24 text-center p-0" colSpan={colSpan}>
                <div className="flex gap-2 flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-5">
                    <div className="text-center">{children}</div>
                </div>
            </Cell>
        </Row>
    );
};

export { Table, Header, Body, Footer, Head, Row, Cell, Caption, Empty };
