import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as React from 'react';

import { cn } from '../../lib/cn';
import { buttonVariants } from './button';

// Radix can leak `body.style.pointerEvents = 'none'` when a modal unmounts during navigation.
// Clear that leaked body lock only after every dialog/select layer is gone.
function restoreLeakedRadixBodyPointerEvents(ownerDocument = globalThis?.document) {
    if (!ownerDocument) {
        return;
    }

    requestAnimationFrame(() => {
        if (ownerDocument.body.style.pointerEvents !== 'none') {
            return;
        }

        if (ownerDocument.querySelector('[data-slot="alert-dialog-content"], [data-slot="dialog-content"], [data-slot="select-content"]')) {
            return;
        }

        ownerDocument.body.style.pointerEvents = '';
    });
}

type AlertDialogSize = 'default' | 'sm';

interface AlertDialogContextValue {
    size: AlertDialogSize;
    /** Danger tone — reddens the title and switches the action button to `danger`. */
    destructive: boolean;
}

const AlertDialogContext = React.createContext<AlertDialogContextValue>({ size: 'default', destructive: false });
const useAlertDialogContext = () => React.useContext(AlertDialogContext);

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
    return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

const AlertDialogTrigger = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Trigger>
>((props, ref) => <AlertDialogPrimitive.Trigger ref={ref} data-slot="alert-dialog-trigger" {...props} />);
AlertDialogTrigger.displayName = 'AlertDialogTrigger';

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
    return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

const AlertDialogOverlay = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Overlay
        ref={ref}
        data-slot="alert-dialog-overlay"
        className={cn(
            'bg-surface-scrim data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50',
            className
        )}
        {...props}
    />
));
AlertDialogOverlay.displayName = 'AlertDialogOverlay';

export interface AlertDialogContentProps extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> {
    /** `default` (384px, header row) or `sm` (320px, centered header + split full-width footer). */
    size?: AlertDialogSize;
    /** Danger tone — reddens the title and switches the action button to `danger`. */
    destructive?: boolean;
}

const AlertDialogContent = React.forwardRef<React.ElementRef<typeof AlertDialogPrimitive.Content>, AlertDialogContentProps>(
    ({ className, size = 'default', destructive = false, children, ...props }, ref) => {
        const ownerDocument = globalThis?.document;

        React.useEffect(() => {
            return () => {
                restoreLeakedRadixBodyPointerEvents(ownerDocument);
            };
        }, [ownerDocument]);

        return (
            <AlertDialogContext.Provider value={{ size, destructive }}>
                <AlertDialogPortal>
                    <AlertDialogOverlay />
                    <AlertDialogPrimitive.Content
                        ref={ref}
                        data-slot="alert-dialog-content"
                        className={cn(
                            'bg-surface-overlay border-ds-1 border-border-default rounded-ds-sm shadow-container-sheet',
                            'fixed top-[50%] left-[50%] z-50 flex w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden',
                            size === 'sm' ? 'sm:max-w-80' : 'sm:max-w-96',
                            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200',
                            className
                        )}
                        {...props}
                    >
                        {children}
                    </AlertDialogPrimitive.Content>
                </AlertDialogPortal>
            </AlertDialogContext.Provider>
        );
    }
);
AlertDialogContent.displayName = 'AlertDialogContent';

/** 40px rounded media box for the header icon (Figma "_AlertDialogMedia"). The icon turns danger under the destructive tone. */
const AlertDialogMedia = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => {
    const { destructive } = useAlertDialogContext();
    return (
        <div
            ref={ref}
            data-slot="alert-dialog-media"
            className={cn(
                'bg-state-pressed border-ds-1 border-border-default rounded-ds-sm flex size-10 shrink-0 items-center justify-center overflow-hidden',
                '[&_svg]:size-6 [&_svg]:shrink-0',
                destructive ? '[&_svg]:text-status-danger-icon' : '[&_svg]:text-icon-default',
                className
            )}
            {...props}
        />
    );
});
AlertDialogMedia.displayName = 'AlertDialogMedia';

export interface AlertDialogHeaderProps extends React.ComponentProps<'div'> {
    /** Optional icon rendered inside the media box (Figma header leads with Activity / Trash2). */
    icon?: React.ReactNode;
}

/**
 * Media + title/description (Figma "_AlertDialogHeader"). Layout follows the content `size`:
 * `default` lays the icon beside the text; `sm` stacks and centers them.
 */
const AlertDialogHeader = React.forwardRef<HTMLDivElement, AlertDialogHeaderProps>(({ className, icon, children, ...props }, ref) => {
    const { size } = useAlertDialogContext();
    return (
        <div
            ref={ref}
            data-slot="alert-dialog-header"
            className={cn('flex p-4', size === 'sm' ? 'flex-col items-center gap-3.5' : 'items-start gap-4', className)}
            {...props}
        >
            {icon != null && <AlertDialogMedia>{icon}</AlertDialogMedia>}
            <div className={cn('flex flex-col gap-1.5', size === 'sm' ? 'w-full text-center' : 'min-w-0 flex-1')}>{children}</div>
        </div>
    );
});
AlertDialogHeader.displayName = 'AlertDialogHeader';

/** Figma heading/sm; reddens under the destructive tone. */
const AlertDialogTitle = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => {
    const { destructive } = useAlertDialogContext();
    return (
        <AlertDialogPrimitive.Title
            ref={ref}
            data-slot="alert-dialog-title"
            // Figma heading/sm. Colour is separate: destructive → status/danger/text; default → Figma text/default, using text-strong to match DialogTitle (revisit in visual QA).
            className={cn('type-heading-sm', destructive ? 'text-status-danger-text' : 'text-text-strong', className)}
            {...props}
        />
    );
});
AlertDialogTitle.displayName = 'AlertDialogTitle';

/** Figma text/regular/md, text/secondary colour. */
const AlertDialogDescription = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Description
        ref={ref}
        data-slot="alert-dialog-description"
        className={cn('type-text-regular-md text-text-secondary', className)}
        {...props}
    />
));
AlertDialogDescription.displayName = 'AlertDialogDescription';

/**
 * Actions bar with a top border on the panel surface (Figma "_AlertDialogFooter").
 * `default` right-aligns the buttons; `sm` splits them full-width.
 */
const AlertDialogFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ className, ...props }, ref) => {
    const { size } = useAlertDialogContext();
    return (
        <div
            ref={ref}
            data-slot="alert-dialog-footer"
            className={cn(
                'bg-surface-panel border-t border-border-default flex items-center gap-2 p-4',
                size === 'sm' ? '[&>*]:flex-1' : 'justify-end',
                className
            )}
            {...props}
        />
    );
});
AlertDialogFooter.displayName = 'AlertDialogFooter';

/** Confirm button (Figma primary / danger, size sm). Closes the dialog on click. */
const AlertDialogAction = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Action>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => {
    const { destructive } = useAlertDialogContext();
    return (
        <AlertDialogPrimitive.Action
            ref={ref}
            data-slot="alert-dialog-action"
            className={cn(buttonVariants({ variant: destructive ? 'danger' : 'primary', size: 'sm' }), className)}
            {...props}
        />
    );
});
AlertDialogAction.displayName = 'AlertDialogAction';

/** Dismiss button (Figma outline, size sm). Closes the dialog on click. */
const AlertDialogCancel = React.forwardRef<
    React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
    React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
    <AlertDialogPrimitive.Cancel
        ref={ref}
        data-slot="alert-dialog-cancel"
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), className)}
        {...props}
    />
));
AlertDialogCancel.displayName = 'AlertDialogCancel';

export {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogOverlay,
    AlertDialogPortal,
    AlertDialogTitle,
    AlertDialogTrigger
};
