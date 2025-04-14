import { flexRender } from '@tanstack/react-table';

import * as Table from '../../../components/ui/Table';

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
        <Table.Row
            data-state={row.getIsSelected() && 'selected'}
            className="hover:cursor-pointer flex absolute w-full"
            onClick={() => {
                onSelectOperation(true, row.original.id);
            }}
            data-index={virtualRow.index} //needed for dynamic row height measurement
            ref={(node) => rowVirtualizer.measureElement(node)} //measure dynamic row height
            key={row.id}
            style={{
                transform: `translateY(${virtualRow.start}px)` //this should always be a `style` as it changes on scroll
            }}
        >
            {row.getVisibleCells().map((cell) => (
                <Table.Cell className="flex" style={{ width: cell.column.getSize() }} key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Table.Cell>
            ))}
        </Table.Row>
    );
};
