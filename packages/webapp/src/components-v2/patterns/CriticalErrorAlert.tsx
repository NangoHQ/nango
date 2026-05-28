import { CircleX } from 'lucide-react';
import { useMemo } from 'react';

import { StyledLink } from './StyledLink';
import { Alert, AlertDescription } from './ui/alert';

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
                {finalMessage}. Please{' '}
                <StyledLink to="https://nango.dev/slack" icon type="external" variant="error">
                    contact support
                </StyledLink>
                .
            </AlertDescription>
        </Alert>
    );
};
