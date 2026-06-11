import { X } from 'lucide-react';
import { useState } from 'react';

import { CopyButton } from '../../../components/ui/CopyButton';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '../../../components/ui/Sheet';
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
            <SheetContent
                side="right"
                hideCloseButton
                className="w-[1034px] max-w-none sm:max-w-none p-0 bg-surface-page text-text-strong border-l-border-muted"
            >
                <SheetTitle className="sr-only">Operation Details</SheetTitle>
                <div className="relative h-full select-text">
                    <div className="absolute right-6 top-[35px] flex items-center gap-1">
                        <CopyButton
                            text={window.location.href}
                            iconType="link"
                            className="text-text-light-gray hover:text-white focus:text-white transition-colors"
                        />
                        <SheetClose
                            title="Close"
                            className="bg-transparent text-text-muted hover:text-text-strong focus:text-text-strong transition-colors size-8 flex items-center justify-center"
                        >
                            <X size={16} />
                        </SheetClose>
                    </div>
                    <ShowOperation operationId={operationId} />
                </div>
            </SheetContent>
        </Sheet>
    );
};
