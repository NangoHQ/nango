import type React from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/Alert';
import type { ComponentProps } from 'react';
import { cn } from '../utils/utils';
import { Button } from './ui/button/Button';
import { IconInfoCircleFilled, IconX } from '@tabler/icons-react';

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
                        'rounded-full p-0.5 mt-0.5',
                        props.variant === 'destructive' && 'bg-red-base-35',
                        props.variant === 'warning' && 'bg-yellow-base-35',
                        (!props.variant || props.variant === 'default') && 'bg-blue-base-35'
                    )}
                >
                    <IconInfoCircleFilled className="h-3.5 w-3.5" />
                </div>
            )}
            <div className="w-full flex items-center justify-between">
                <div className="flex flex-col gap-2">
                    {title && <AlertTitle>{title}</AlertTitle>}
                    <AlertDescription>{children}</AlertDescription>
                </div>
                {onClose && (
                    <Button size={'xs'} variant={'icon'} onClick={onClose} className="">
                        <IconX stroke={1} size={18}></IconX>
                    </Button>
                )}
            </div>
        </Alert>
    );
};
