import { forwardRef } from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../../../utils/utils';
import { IconX } from '@tabler/icons-react';

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = forwardRef<React.ElementRef<typeof ToastPrimitives.Viewport>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>>(
    ({ className, ...props }, ref) => (
        <ToastPrimitives.Viewport
            ref={ref}
            className={cn('fixed bottom-10 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 items-center pointer-events-none', className)}
            {...props}
        />
    )
);
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
    'max-w-[500px] pointer-events-all group pointer-events-auto relative flex items-center justify-between space-x-4 overflow-hidden rounded-md border p-1 px-3 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
    {
        variants: {
            variant: {
                default: 'border bg-background text-foreground',
                success: 'bg-green-dark border border-green-base text-green-base',
                error: 'bg-red-dark border border-red-base text-red-base',
                destructive: 'destructive group border-destructive bg-destructive text-destructive-foreground'
            }
        },
        defaultVariants: {
            variant: 'default'
        }
    }
);

const Toast = forwardRef<
    React.ElementRef<typeof ToastPrimitives.Root>,
    React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
    return <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />;
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = forwardRef<React.ElementRef<typeof ToastPrimitives.Action>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>>(
    ({ className, ...props }, ref) => (
        <ToastPrimitives.Action
            ref={ref}
            className={cn(
                'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive',
                className
            )}
            {...props}
        />
    )
);
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = forwardRef<React.ElementRef<typeof ToastPrimitives.Close>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>>(
    ({ className, ...props }, ref) => (
        <ToastPrimitives.Close
            ref={ref}
            className={cn(
                'absolute right-2 top-[3px] rounded-md p-1 text-foreground/50 hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600',
                className
            )}
            toast-close=""
            {...props}
        >
            <IconX stroke={1} size={16} />
        </ToastPrimitives.Close>
    )
);
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = forwardRef<React.ElementRef<typeof ToastPrimitives.Title>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>>(
    ({ className, ...props }, ref) => <ToastPrimitives.Title ref={ref} className={cn('text-sm', className)} {...props} />
);
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = forwardRef<React.ElementRef<typeof ToastPrimitives.Description>, React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>>(
    ({ className, ...props }, ref) => <ToastPrimitives.Description ref={ref} className={cn('text-sm opacity-90', className)} {...props} />
);
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export { type ToastProps, type ToastActionElement, ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose, ToastAction };
