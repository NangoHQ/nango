import type { Row } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import type { SearchOperationsData } from '@nangohq/types';

import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from '../../../components/ui/Drawer';
import * as Table from '../../../components/ui/Table';
import { ShowOperation } from '../ShowOperation';
import { Cross1Icon } from '@radix-ui/react-icons';
import { useSearchParams } from 'react-router-dom';

const drawerWidth = '1034px';
export const OperationRow: React.FC<{ row: Row<SearchOperationsData> }> = ({ row }) => {
    const [, setSearchParams] = useSearchParams();
    const onOpenChange = (open: boolean) => {
        // Set search params for sharing URL
        if (open) {
            setSearchParams((prev) => {
                prev.set('operationId', row.original.id);
                return prev;
            });
        } else {
            setSearchParams((prev) => {
                prev.delete('operationId');
                return prev;
            });
        }
    };

    return (
        <Drawer direction="right" snapPoints={[drawerWidth]} handleOnly={true} noBodyStyles={true} onOpenChange={(v) => setTimeout(() => onOpenChange(v), 500)}>
            <DrawerTrigger asChild type={null as unknown as 'button'}>
                <Table.Row data-state={row.getIsSelected() && 'selected'} className="hover:cursor-pointer">
                    {row.getVisibleCells().map((cell) => (
                        <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
                    ))}
                </Table.Row>
            </DrawerTrigger>
            <DrawerContent>
                <div className={`w-[1034px] relative h-screen`}>
                    <div className="absolute right-4 top-7">
                        <DrawerClose title="Close" className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white">
                            <Cross1Icon className="" />
                        </DrawerClose>
                    </div>
                    <ShowOperation operationId={row.original.id} />
                </div>
            </DrawerContent>
        </Drawer>
    );
};
