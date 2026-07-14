import { flexRender } from '@tanstack/react-table';

import { getLogsColumnStyle } from '../columnSizing';

import type { SearchOperationsData } from '@nangohq/types';
import type { Row } from '@tanstack/react-table';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';

export const OperationRow: React.FC<{
    row: Row<SearchOperationsData>;
    virtualRow: VirtualItem;
    rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>;
    onSelectOperation: (open: boolean, operationId: string) => void;
}> = ({ row, virtualRow, rowVirtualizer, onSelectOperation }) => {
    return (
        <tr
            data-state={row.getIsSelected() && 'selected'}
            className="text-s text-text-muted transition-colors border-transparent border-b border-b-border-muted hover:bg-surface-page hover:text-text-strong hover:cursor-pointer flex absolute w-full"
            onClick={() => {
                onSelectOperation(true, row.original.id);
            }}
            data-index={virtualRow.index}
            ref={(node) => rowVirtualizer.measureElement(node)}
            style={{
                transform: `translateY(${virtualRow.start}px)`
            }}
        >
            {row.getVisibleCells().map((cell) => (
                <td className="flex items-center px-3 py-2.5 align-middle overflow-hidden" style={getLogsColumnStyle(cell.column)} key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
            ))}
        </tr>
    );
};
