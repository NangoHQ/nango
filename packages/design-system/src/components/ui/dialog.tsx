import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/cn';

// Radix can leak `body.style.pointerEvents = 'none'` when a dialog unmounts during navigation.
// Clear that leaked body lock only after all dialog/select layers are gone.
function restoreLeakedRadixBodyPointerEvents(ownerDocument = globalThis?.document) {
    if (!ownerDocument) {
        return;
    }

    requestAnimationFrame(() => {
        if (ownerDocument.body.style.pointerEvents !== 'none') {
            return;
        }

        if (ownerDocument.querySelector('[data-slot="dialog-content"], [data-slot="select-content"]')) {
            return;
        }

        ownerDocument.body.style.pointerEvents = '';
    });
}

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
    return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

const DialogTrigger = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>>(
    (props, ref) => <DialogPrimitive.Trigger ref={ref} data-slot="dialog-trigger" {...props} />
);
DialogTrigger.displayName = 'DialogTrigger';

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
    return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

const DialogClose = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Close>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>>(
    (props, ref) => <DialogPrimitive.Close ref={ref} data-slot="dialog-close" {...props} />
);
DialogClose.displayName = 'DialogClose';

const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
    ({ className, ...props }, ref) => (
        <DialogPrimitive.Overlay
            ref={ref}
            data-slot="dialog-overlay"
            className={cn(
                'bg-surface-scrim data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50',
                className
            )}
            {...props}
        />
    )
);
DialogOverlay.displayName = 'DialogOverlay';

export interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
    showCloseButton?: boolean;
}

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
    ({ className, children, showCloseButton = true, ...props }, ref) => {
        const ownerDocument = globalThis?.document;

        React.useEffect(() => {
            return () => {
                restoreLeakedRadixBodyPointerEvents(ownerDocument);
            };
        }, [ownerDocument]);

        return (
            <DialogPortal>
                <DialogOverlay />
                <DialogPrimitive.Content
                    ref={ref}
                    data-slot="dialog-content"
                    className={cn(
                        'bg-surface-overlay border-ds-1 border-border-default rounded-ds-sm shadow-container-sheet',
                        'fixed top-[50%] left-[50%] z-50 flex w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden sm:max-w-md',
                        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200',
                        className
                    )}
                    {...props}
                >
                    {children}
                    {showCloseButton && (
                        <DialogPrimitive.Close
                            data-slot="dialog-close"
                            className="text-text-secondary hover:text-text-strong rounded-ds-xs focus-visible:shadow-focus-outline-default absolute top-4 right-4 cursor-pointer transition-colors outline-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                        >
                            <XIcon />
                            <span className="sr-only">Close</span>
                        </DialogPrimitive.Close>
                    )}
                </DialogPrimitive.Content>
            </DialogPortal>
        );
    }
);
DialogContent.displayName = 'DialogContent';

/** Title + optional description (Figma "Dialog Header", spacing/4 padding). */
const DialogHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div ref={ref} data-slot="dialog-header" className={cn('flex flex-col gap-2 p-4', className)} {...props} />
));
DialogHeader.displayName = 'DialogHeader';

/** Main body of the dialog (Figma "Dialog Content", spacing/4 padding, no top — the header provides it). */
const DialogBody = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div ref={ref} data-slot="dialog-body" className={cn('px-4 pb-4', className)} {...props} />
));
DialogBody.displayName = 'DialogBody';

/** Actions bar with a top border on the panel surface (Figma "Dialog Footer"). */
const DialogFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        data-slot="dialog-footer"
        className={cn('bg-surface-panel border-t border-border-default flex items-center justify-end gap-2 p-4', className)}
        {...props}
    />
));
DialogFooter.displayName = 'DialogFooter';

/** Figma heading/sm. */
const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
    ({ className, ...props }, ref) => (
        <DialogPrimitive.Title
            ref={ref}
            data-slot="dialog-title"
            className={cn('text-text-strong text-ds-lg font-ds-medium leading-ds-snug tracking-ds-tight', className)}
            {...props}
        />
    )
);
DialogTitle.displayName = 'DialogTitle';

/** Figma text/secondary + text/regular/md. */
const DialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        data-slot="dialog-description"
        className={cn('text-text-secondary text-ds-md font-ds-regular leading-ds-normal', className)}
        {...props}
    />
));
DialogDescription.displayName = 'DialogDescription';

export {
    Dialog,
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
    DialogTrigger
};
