import { flexRender } from '@tanstack/react-table';

import * as Table from '../../../../components/ui/Table';
import { cn } from '../../../../utils/utils';

import type { SearchMessagesData } from '@nangohq/types';
import type { Row } from '@tanstack/react-table';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';

export const LogRow: React.FC<{
    row: Row<SearchMessagesData>;
    virtualRow: VirtualItem;
    rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>;
    onSelectMessage: (msg: SearchMessagesData) => void;
}> = ({ row, virtualRow, rowVirtualizer, onSelectMessage }) => {
    return (
        <Table.Row
            data-state={row.getIsSelected() && 'selected'}
            className={cn(
                'focus:bg-grayscale-900 hover:cursor-pointer flex absolute w-full border-b-border-gray-400 !border-l-2',
                row.original.level === 'error' && 'hover:border-l-red-500 focus:border-l-red-500',
                row.original.level === 'warn' && 'hover:border-l-yellow-400 focus:border-l-yellow-400',
                row.original.level === 'info' && 'hover:border-l-blue-400 focus:border-l-blue-400',
                row.original.level === 'debug' && 'hover:border-l-gray-400 focus:border-l-gray-400'
            )}
            data-index={virtualRow.index} //needed for dynamic row height measurement
            ref={(node) => rowVirtualizer.measureElement(node)} //measure dynamic row height
            style={{
                transform: `translateY(${virtualRow.start}px)` //this should always be a `style` as it changes on scroll
            }}
            tabIndex={0}
            role="button"
            onClick={() => {
                console.log('on click salope');
                onSelectMessage(row.original);
            }}
        >
            {row.getVisibleCells().map((cell) => (
                <Table.Cell key={cell.id} style={{ width: cell.column.columnDef.size }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Table.Cell>
            ))}
        </Table.Row>
    );
};
