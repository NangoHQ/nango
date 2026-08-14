import { CircleX, ExternalLink } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@nangohq/design-system';

import { Alert, AlertDescription } from '../ui/Alert';

/**
 * For reuse on generic error scenarios.
 */
export const CriticalErrorAlert: React.FC<{ message: string }> = ({ message }) => {
    // Remove last `.` if present
    const finalMessage = useMemo(() => {
        return message.replace(/\.$/, '');
    }, [message]);

    return (
        <Alert variant="error" className="w-full">
            <CircleX />
            <AlertDescription>
                <span>
                    {finalMessage}. Please{' '}
                    <Button asChild variant="link-danger">
                        <a href="https://nango.dev/slack" target="_blank" rel="noopener noreferrer">
                            contact support
                            <ExternalLink />
                        </a>
                    </Button>
                    .
                </span>
            </AlertDescription>
        </Alert>
    );
};
