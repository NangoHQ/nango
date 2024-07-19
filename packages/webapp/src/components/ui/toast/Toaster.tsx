import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './Toast';
import { useToast } from '../../../hooks/useToast';
import { CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons';

export function Toaster() {
    const { toasts } = useToast();

    return (
        <ToastProvider>
            {toasts.map(function ({ id, title, description, action, ...props }) {
                return (
                    <Toast key={id} {...props}>
                        <div className="flex gap-2 items-center">
                            <div>
                                {props.variant === 'success' && (
                                    <div className="bg-green-base bg-opacity-35 rounded-full">
                                        <CheckCircledIcon />
                                    </div>
                                )}
                                {props.variant === 'error' && (
                                    <div className="bg-red-base bg-opacity-35 rounded-full">
                                        <CrossCircledIcon />
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
