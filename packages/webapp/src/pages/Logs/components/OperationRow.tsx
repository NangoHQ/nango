import type { Row } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import type { SearchOperationsData } from '@nangohq/types';

import * as Table from '../../../components/ui/Table';

export const OperationRow: React.FC<{ row: Row<SearchOperationsData>; onSelectOperation: (open: boolean, operationId: string) => void }> = ({
    row,
    onSelectOperation
}) => {
    return (
        <Table.Row
            data-state={row.getIsSelected() && 'selected'}
            className="hover:cursor-pointer"
            onClick={() => {
                onSelectOperation(true, row.original.id);
            }}
        >
            {row.getVisibleCells().map((cell) => (
                <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
            ))}
        </Table.Row>
    );
};
