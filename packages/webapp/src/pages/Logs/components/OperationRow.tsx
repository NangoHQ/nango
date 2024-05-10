import type { Row } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import type { SearchLogsData } from '@nangohq/types';

import { Drawer, DrawerContent, DrawerTrigger } from '../../../components/ui/Drawer';
import * as Table from '../../../components/ui/Table';
import { useState } from 'react';
import { Show } from '../Show';

export const OperationRow: React.FC<{ row: Row<SearchLogsData> }> = ({ row }) => {
    const [open, setOpen] = useState<boolean>(false);

    return (
        <Drawer direction="right" snapPoints={[0.5]} onOpenChange={setOpen}>
            <DrawerTrigger asChild type={null as unknown as 'button'}>
                <Table.Row data-state={row.getIsSelected() && 'selected'} className="hover:cursor-pointer">
                    {row.getVisibleCells().map((cell) => (
                        <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
                    ))}
                </Table.Row>
            </DrawerTrigger>
            <DrawerContent>{open && <Show />}</DrawerContent>
        </Drawer>
    );
};
