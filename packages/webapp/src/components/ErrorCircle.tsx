import { IconCircleCheckFilled, IconCircleXFilled, IconClockHour4Filled, IconExclamationCircleFilled, IconInfoCircleFilled } from '@tabler/icons-react';

import { cn } from '../utils/utils';
import { IconAuth } from './icons/auth';
import { IconSync } from './icons/sync';

import type React from 'react';

const colorMap = {
    success: 'success-400',
    error: 'alert-400',
    warning: 'warning-400',
    info: 'info-400'
};

export type ErrorCircleIcon = '!' | 'sync' | 'auth' | 'clock' | 'x' | 'info' | 'check';
export type ErrorCircleVariant = 'success' | 'error' | 'warning' | 'info';
export const ErrorCircle: React.FC<{ icon?: ErrorCircleIcon; variant?: ErrorCircleVariant }> = ({ icon = '!', variant = 'error' }) => {
    const color = colorMap[variant];
    const bgColor = `bg-${color}`;
    const iconColor = `text-${color}`;

    // Tabler icons seem to have a small padding by default, so we add a smaller padding for them to make them consistent
    const padding = icon === 'sync' || icon === 'auth' ? 'p-[3px]' : 'p-[2px]';

    return (
        <div className={cn('cursor-auto w-[20px] h-[20px] rounded-full bg-opacity-30', bgColor, padding)}>
            <div className={cn('w-full h-full flex items-center justify-center', iconColor)}>
                {icon === '!' && <IconExclamationCircleFilled />}
                {icon === 'sync' && <IconSync />}
                {icon === 'auth' && <IconAuth />}
                {icon === 'clock' && <IconClockHour4Filled />}
                {icon === 'x' && <IconCircleXFilled />}
                {icon === 'info' && <IconInfoCircleFilled />}
                {icon === 'check' && <IconCircleCheckFilled />}
            </div>
        </div>
    );
};
