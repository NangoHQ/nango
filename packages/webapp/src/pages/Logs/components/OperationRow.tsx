import { flexRender } from '@tanstack/react-table';

import { TableCell, TableRow } from '@/components-v2/ui/Table';

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
        <TableRow
            data-state={row.getIsSelected() && 'selected'}
            className="hover:cursor-pointer flex absolute w-full"
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
                <TableCell className="flex" style={{ width: cell.column.getSize() }} key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
            ))}
        </TableRow>
    );
};
