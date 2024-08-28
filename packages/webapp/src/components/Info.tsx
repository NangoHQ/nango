import type React from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/Alert';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import type { ComponentProps } from 'react';
import { cn } from '../utils/utils';

export const Info: React.FC<{ children: React.ReactNode; title?: string } & ComponentProps<typeof Alert>> = ({ children, title, ...props }) => {
    return (
        <Alert variant={'default'} {...props}>
            <div
                className={cn(
                    'rounded-full p-1',
                    props.variant === 'destructive' && 'bg-red-base-35',
                    props.variant === 'warning' && 'bg-yellow-base-35',
                    (!props.variant || props.variant === 'default') && 'bg-blue-base-35'
                )}
            >
                <InfoCircledIcon className="h-4 w-4" />
            </div>
            {title && <AlertTitle>{title}</AlertTitle>}
            <AlertDescription>{children}</AlertDescription>
        </Alert>
    );
};
