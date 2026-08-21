import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@nangohq/design-system';

interface ToastProps {
    title?: string;
    description?: string;
    variant: 'success' | 'error' | 'warning' | 'info';
    id: string | number;
    action?: React.ReactNode;
}

const iconMap = {
    success: <CircleCheck />,
    error: <CircleX />,
    warning: <CircleAlert />,
    info: <Info />
};

// The design system calls the red status `danger`; this component's public prop stays `error`.
const alertVariantMap = {
    success: 'success',
    error: 'danger',
    warning: 'warning',
    info: 'info'
} as const;

export const Toast = ({ title, description, variant, id, action }: ToastProps) => {
    const icon = iconMap[variant];

    return (
        <div className="w-[350px]">
            <Alert variant={alertVariantMap[variant]} size="toast" onDismiss={() => sonnerToast.dismiss(id)}>
                {icon}
                {title && description ? (
                    <>
                        <AlertTitle>{title}</AlertTitle>
                        <AlertDescription>{description}</AlertDescription>
                    </>
                ) : (
                    (title || description) && <AlertDescription>{title || description}</AlertDescription>
                )}

                {action && <AlertActions>{action}</AlertActions>}
            </Alert>
        </div>
    );
};
