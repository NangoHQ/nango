import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './Toast';
import { useToast } from '../../../hooks/useToast';
import { IconCheck, IconX } from '@tabler/icons-react';

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
                                    <div className="bg-success-400 bg-opacity-40 rounded-full p-1">
                                        <div className="bg-success-400 text-success-500 rounded-full">
                                            <IconCheck stroke={1} size={10} />
                                        </div>
                                    </div>
                                )}
                                {props.variant === 'error' && (
                                    <div className="bg-alert-400 bg-opacity-40 rounded-full p-1">
                                        <div className="bg-alert-400 text-alert-500 rounded-full">
                                            <IconX stroke={1} size={10} />
                                        </div>
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
