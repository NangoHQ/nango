import { IconClockHour4Filled, IconExclamationMark, IconLock, IconRefresh } from '@tabler/icons-react';

import { cn } from '../utils/utils';

import type React from 'react';

export type ErrorCircleIcon = '!' | 'sync' | 'auth' | 'clock';
export type ErrorCircleVariant = 'error' | 'warning';
export const ErrorCircle: React.FC<{ icon?: ErrorCircleIcon; variant?: ErrorCircleVariant }> = ({ icon = '!', variant = 'error' }) => {
    if (icon === 'clock') {
        return (
            <div className="cursor-auto bg-warning-400 bg-opacity-40 p-[1px] rounded-full h-6 w-6">
                <div className="w-full h-full flex items-center justify-center bg-transparent text-warning-500">
                    <IconClockHour4Filled stroke={1} />
                </div>
            </div>
        );
    }

    return (
        <div className={cn('cursor-auto flex h-6 w-6 rounded-full bg-opacity-40 p-[3px]', variant === 'warning' ? 'bg-warning-400' : 'bg-alert-400')}>
            <div
                className={cn(
                    'rounded-full w-full h-full flex items-center justify-center text-[#6d5a2c]',
                    variant === 'warning' ? 'bg-warning-500' : 'bg-red-base'
                )}
            >
                {icon === '!' && <IconExclamationMark stroke={2} size={14} />}
                {icon === 'sync' && <IconRefresh stroke={2} size={16} />}
                {icon === 'auth' && <IconLock stroke={2} size={16} />}
            </div>
        </div>
    );
};
