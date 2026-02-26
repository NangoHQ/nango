import { toast as sonnerToast } from 'sonner';

import { Toast } from '@/components-v2/Toast';

interface ToastProps {
    title?: string;
    description?: string;
    variant: 'success' | 'error' | 'warning' | 'info';
    id: string | number;
}

function toast({ title, description, variant }: Omit<ToastProps, 'id'>) {
    return sonnerToast.custom((id) => <Toast id={id} title={title} description={description} variant={variant} />);
}

export function useToast() {
    return {
        toast
    };
}
