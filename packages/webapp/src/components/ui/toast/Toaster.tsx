import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './Toast';
import { useToast } from '../../../hooks/useToast';
import { CheckIcon, Cross1Icon } from '@radix-ui/react-icons';

export function Toaster() {
    const { toasts } = useToast();

    return (
        <ToastProvider>
            {toasts.map(function ({ id, title, description, action, ...props }) {
                return (
                    <Toast key={id} {...props}>
                        <div className="flex gap-2 items-center mr-2">
                            <div>
                                {props.variant === 'success' && (
                                    <div className="bg-green-base text-green-dark rounded-full border-2 border-green-base-35">
                                        <CheckIcon className="w-2.5 h-2.5" />
                                    </div>
                                )}
                                {props.variant === 'error' && (
                                    <div className="bg-red-base bg-opacity-35 rounded-full">
                                        <Cross1Icon />
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="grid gap-1">
                                    {title && <ToastTitle>{title}</ToastTitle>}
                                    {description && <ToastDescription>{description}</ToastDescription>}
                                </div>
                                {action}
                            </div>
                        </div>
                        <ToastClose />
                    </Toast>
                );
            })}
            <ToastViewport />
        </ToastProvider>
    );
}
