import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from '../../../components/ui/Drawer';
import { ShowOperation } from '../ShowOperation';
import { Cross1Icon } from '@radix-ui/react-icons';
import { useState } from 'react';

const drawerWidth = '1034px';
export const OperationDrawer: React.FC<{ operationId: string; forceOpen?: boolean }> = ({ operationId }) => {
    const [open, setOpen] = useState(true);

    return (
        <Drawer direction="right" snapPoints={[drawerWidth]} handleOnly={true} noBodyStyles={true} open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild type={null as unknown as 'button'}></DrawerTrigger>
            <DrawerContent>
                <div className={`w-[1034px] relative h-screen`}>
                    <div className="absolute right-4 top-7">
                        <DrawerClose title="Close" className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white">
                            <Cross1Icon className="" />
                        </DrawerClose>
                    </div>
                    <ShowOperation operationId={operationId} />
                </div>
            </DrawerContent>
        </Drawer>
    );
};
