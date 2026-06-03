import { useState } from 'react';

import { Sheet, SheetContent } from '../../../components-v2/ui/Sheet';
import { ShowOperation } from '../Operation/Show';

export const OperationDrawer: React.FC<{ operationId: string; onClose: (open: boolean, operationId: string) => void }> = ({ operationId, onClose }) => {
    const [open, setOpen] = useState(true);

    return (
        <Sheet
            open={open}
            onOpenChange={(val) => {
                setOpen(val);
                if (!val) {
                    setTimeout(() => onClose(false, operationId), 300);
                }
            }}
        >
            <SheetContent side="right" className="w-[1034px] max-w-none sm:max-w-none p-0 bg-active-gray text-white border-l-border-gray-400">
                <div className="relative h-full select-text">
                    <ShowOperation operationId={operationId} />
                </div>
            </SheetContent>
        </Sheet>
    );
};
