import { toast as sonnerToast } from 'sonner';

import { Toast } from '@/components/ui/Toast';

interface ToastProps {
    title?: string;
    description?: string;
    variant: 'success' | 'error' | 'warning' | 'info';
    id: string | number;
    action?: React.ReactNode;
}

function toast({ title, description, variant, action, duration }: Omit<ToastProps, 'id'> & { duration?: number }) {
    return sonnerToast.custom((id) => <Toast id={id} title={title} description={description} variant={variant} action={action} />, { duration });
}

export function useToast() {
    return {
        toast
    };
}
