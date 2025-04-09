import { IconClockHour4Filled, IconExclamationMark, IconLock, IconRefresh } from '@tabler/icons-react';

import { cn } from '../utils/utils';

import type React from 'react';

export type ErrorCircleIcon = '!' | 'sync' | 'auth' | 'clock';
export type ErrorCircleVariant = 'error' | 'warning';
export const ErrorCircle: React.FC<{ icon?: ErrorCircleIcon; variant?: ErrorCircleVariant }> = ({ icon = '!', variant = 'error' }) => {
    if (icon === 'clock') {
        return (
            <div className="bg-warning-400 bg-opacity-40 rounded-full p-0.5 h-4 w-4">
                <div className="bg-transparent text-warning-500 rounded-full">{icon === 'clock' && <IconClockHour4Filled stroke={1} size={12} />}</div>
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
                {icon === '!' && <IconExclamationMark stroke={3} size={12} />}
                {icon === 'sync' && <IconRefresh stroke={2} size={16} />}
                {icon === 'auth' && <IconLock stroke={2} size={16} />}
            </div>
        </div>
    );
};
