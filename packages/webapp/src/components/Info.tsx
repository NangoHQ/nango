import type React from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/Alert';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import type { ComponentProps } from 'react';
import { cn } from '../utils/utils';
import Button from './ui/button/Button';
import { IconX } from '@tabler/icons-react';

export const Info: React.FC<{ children: React.ReactNode; icon?: React.ReactNode; title?: string; onClose?: () => void } & ComponentProps<typeof Alert>> = ({
    children,
    title,
    icon,
    onClose,
    ...props
}) => {
    return (
        <Alert variant={'default'} {...props}>
            {icon ?? (
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
            )}
            <div className="w-full flex items-center justify-between">
                <div>
                    {title && <AlertTitle>{title}</AlertTitle>}
                    <AlertDescription>{children}</AlertDescription>
                </div>
                {onClose && (
                    <Button size={'xs'} variant={'icon'} onClick={onClose}>
                        <IconX stroke={1}></IconX>
                    </Button>
                )}
            </div>
        </Alert>
    );
};
