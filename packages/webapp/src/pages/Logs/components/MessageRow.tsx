import type { Row } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import type { SearchOperationsData } from '@nangohq/types';

import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from '../../../components/ui/Drawer';
import * as Table from '../../../components/ui/Table';
import { Show } from '../Show';
import { Cross1Icon } from '@radix-ui/react-icons';

const drawerWidth = '1034px';
export const MessageRow: React.FC<{ row: Row<SearchOperationsData> }> = ({ row }) => {
    return (
        <Drawer direction="right" snapPoints={[drawerWidth]} handleOnly={true} noBodyStyles={true}>
            <DrawerTrigger asChild type={null as unknown as 'button'}>
                <Table.Row data-state={row.getIsSelected() && 'selected'} className="hover:cursor-pointer border-b-border-gray-400">
                    {row.getVisibleCells().map((cell) => (
                        <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
                    ))}
                </Table.Row>
            </DrawerTrigger>
            <DrawerContent>
                <div className={`w-[1034px] relative`}>
                    <div className="absolute right-4 top-4">
                        <DrawerClose title="Close" className="w-8 h-8 flex items-center justify-center">
                            <Cross1Icon className="text-gray-400 hover:text-white" />
                        </DrawerClose>
                    </div>
                    <Show operationId={row.original.id} />
                </div>
            </DrawerContent>
        </Drawer>
    );
};
