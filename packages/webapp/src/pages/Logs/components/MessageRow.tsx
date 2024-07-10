import type { Row } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import type { SearchMessagesData } from '@nangohq/types';

import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from '../../../components/ui/Drawer';
import * as Table from '../../../components/ui/Table';
import { ShowMessage } from '../ShowMessage';
import { ArrowLeftIcon } from '@radix-ui/react-icons';
import { cn } from '../../../utils/utils';

const drawerWidth = '834px';
export const MessageRow: React.FC<{ row: Row<SearchMessagesData> }> = ({ row }) => {
    return (
        <Drawer direction="right" snapPoints={[drawerWidth]} handleOnly={true} noBodyStyles={true} nested>
            <DrawerTrigger asChild type={null as unknown as 'button'}>
                <Table.Row
                    data-state={row.getIsSelected() && 'selected'}
                    className={cn(
                        'hover:cursor-pointer border-b-border-gray-400 !border-l-2 table table-fixed w-full',
                        row.original.level === 'error' && 'hover:border-l-red-500',
                        row.original.level === 'warn' && 'hover:border-l-yellow-400',
                        row.original.level === 'info' && 'hover:border-l-blue-400',
                        row.original.level === 'debug' && 'hover:border-l-gray-400'
                    )}
                >
                    {row.getVisibleCells().map((cell) => (
                        <Table.Cell key={cell.id} style={{ width: cell.column.columnDef.size }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </Table.Cell>
                    ))}
                </Table.Row>
            </DrawerTrigger>
            <DrawerContent>
                <div className={`w-[834px] relative h-screen select-text`}>
                    <div className="absolute top-[26px] left-4">
                        <DrawerClose
                            title="Close"
                            className="w-10 h-10 flex items-center justify-center text-text-light-gray hover:text-white focus:text-white"
                        >
                            <ArrowLeftIcon />
                        </DrawerClose>
                    </div>
                    <ShowMessage message={row.original} />
                </div>
            </DrawerContent>
        </Drawer>
    );
};
