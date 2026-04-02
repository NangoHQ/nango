import { TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription } from '@/components-v2/ui/alert';

export const ErrorChatComponent: React.FC<{ message: string }> = ({ message }) => {
    return (
        <Alert variant="error" className="max-w-2xl">
            <TriangleAlert />
            <AlertDescription>{message}</AlertDescription>
        </Alert>
    );
};
