import { CircleX, ExternalLink } from 'lucide-react';
import { useMemo } from 'react';

import { Alert, AlertButton, AlertDescription } from '@nangohq/design-system';

/**
 * For reuse on generic error scenarios.
 */
export const CriticalErrorAlert: React.FC<{ message: string }> = ({ message }) => {
    // Remove last `.` if present
    const finalMessage = useMemo(() => {
        return message.replace(/\.$/, '');
    }, [message]);

    return (
        <Alert variant="danger">
            <CircleX />
            <AlertDescription>
                <span>
                    {finalMessage}. Please{' '}
                    <AlertButton asChild size="sm">
                        <a href="https://nango.dev/slack" target="_blank" rel="noopener noreferrer">
                            contact support
                            <ExternalLink />
                        </a>
                    </AlertButton>
                    .
                </span>
            </AlertDescription>
        </Alert>
    );
};
