import { flexRender } from '@tanstack/react-table';

import { cn } from '../../../../utils/utils';
import { TableCell, TableRow } from '@/components-v2/ui/Table';

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
        <tr
            data-state={row.getIsSelected() && 'selected'}
            className={cn(
                'text-s text-gray-400 transition-colors focus:bg-grayscale-900 hover:cursor-pointer flex absolute w-full border-b-border-gray-400 border-l-2!',
                row.original.level === 'error' && 'hover:border-l-red-500 focus:border-l-red-500',
                row.original.level === 'warn' && 'hover:border-l-yellow-400 focus:border-l-yellow-400',
                row.original.level === 'info' && 'hover:border-l-blue-400 focus:border-l-blue-400',
                row.original.level === 'debug' && 'hover:border-l-gray-400 focus:border-l-gray-400'
            )}
            data-index={virtualRow.index}
            ref={(node) => rowVirtualizer.measureElement(node)}
            style={{
                transform: `translateY(${virtualRow.start}px)`
            }}
            tabIndex={0}
            role="button"
            onClick={() => {
                onSelectMessage(row.original);
            }}
        >
            {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="flex items-center px-3 py-2.5 align-middle" style={{ width: cell.column.columnDef.size }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
            ))}
        </tr>
    );
};
