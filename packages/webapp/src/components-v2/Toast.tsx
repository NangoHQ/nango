import { CircleAlert, CircleCheck, CircleX, Info, X } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';

import { Alert, AlertActions, AlertButton, AlertDescription, AlertTitle } from './ui/alert';

interface ToastProps {
    title?: string;
    description?: string;
    variant: 'success' | 'error' | 'warning' | 'info';
    id: string | number;
}

const iconMap = {
    success: <CircleCheck />,
    error: <CircleX />,
    warning: <CircleAlert />,
    info: <Info />
};

export const Toast = ({ title, description, variant, id }: ToastProps) => {
    const icon = iconMap[variant];

    return (
        <Alert variant={variant} className="w-[350px]">
            {icon}
            {title && description ? (
                <>
                    <AlertTitle className="text-body-medium-semi">{title}</AlertTitle>
                    <AlertDescription className="text-body-medium-regular">{description}</AlertDescription>
                </>
            ) : (
                (title || description) && <AlertDescription className="text-body-medium-regular">{title || description}</AlertDescription>
            )}

            <AlertActions>
                <AlertButton variant={`${variant}-secondary`} className="border-none" onClick={() => sonnerToast.dismiss(id)}>
                    <X />
                </AlertButton>
            </AlertActions>
        </Alert>
    );
};
