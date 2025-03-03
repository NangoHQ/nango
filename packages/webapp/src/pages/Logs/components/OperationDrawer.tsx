import { useRef, useState } from 'react';
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from '../../../components/ui/Drawer';
import { ShowOperation } from '../ShowOperation';
import { Cross1Icon } from '@radix-ui/react-icons';

const drawerWidth = '1034px';
export const OperationDrawer: React.FC<{ operationId: string; onClose: (open: boolean, operationId: string) => void }> = ({ operationId, onClose }) => {
    const [open, setOpen] = useState(true);
    const ref = useRef<HTMLDivElement>();
    const close = () => {
        if (!ref.current) {
            return;
        }

        // Bug in vaul: https://github.com/emilkowalski/vaul/issues/361
        ref.current.style.setProperty('transform', `translate3d(100%, 0, 0)`);
        ref.current.style.setProperty('transition', `transform 0.5s cubic-bezier(${[0.32, 0.72, 0, 1].join(',')})`);

        setTimeout(() => {
            onClose(false, operationId);
        }, 150);
    };

    return (
        <Drawer
            direction="right"
            snapPoints={[drawerWidth]}
            handleOnly={true}
            noBodyStyles={true}
            dismissible={true}
            open={open}
            onClose={() => setOpen(false)}
            onOpenChange={(val) => (val ? setOpen(val) : close())}
            disablePreventScroll={true}
        >
            <DrawerTrigger asChild type={null as unknown as 'button'}></DrawerTrigger>
            <DrawerContent ref={ref as any}>
                <div className={`w-[1034px] relative h-screen select-text`}>
                    <div className="absolute right-6 top-[35px]">
                        <DrawerClose title="Close" className="w-8 h-6 flex items-center justify-center text-text-light-gray hover:text-white focus:text-white">
                            <Cross1Icon className="" />
                        </DrawerClose>
                    </div>
                    <ShowOperation operationId={operationId} />
                </div>
            </DrawerContent>
        </Drawer>
    );
};
