import type { Row } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import type { SearchOperationsData } from '@nangohq/types';

import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from '../../../components/ui/Drawer';
import * as Table from '../../../components/ui/Table';
import { ShowMessage } from '../ShowMessage';
import { ArrowLeftIcon } from '@radix-ui/react-icons';

const drawerWidth = '834px';
export const MessageRow: React.FC<{ row: Row<SearchOperationsData> }> = ({ row }) => {
    return (
        <Drawer direction="right" snapPoints={[drawerWidth]} handleOnly={true} noBodyStyles={true} nested>
            <DrawerTrigger asChild type={null as unknown as 'button'}>
                <Table.Row data-state={row.getIsSelected() && 'selected'} className="hover:cursor-pointer border-b-border-gray-400">
                    {row.getVisibleCells().map((cell) => (
                        <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
                    ))}
                </Table.Row>
            </DrawerTrigger>
            <DrawerContent>
                <div className={`w-[834px] relative h-screen select-text`}>
                    <div className="absolute top-[26px] left-4">
                        <DrawerClose title="Close" className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white">
                            <ArrowLeftIcon />
                        </DrawerClose>
                    </div>
                    <ShowMessage message={row.original} />
                </div>
            </DrawerContent>
        </Drawer>
    );
};
