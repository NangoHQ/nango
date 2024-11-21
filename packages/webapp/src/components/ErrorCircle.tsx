import { IconExclamationMark, IconLock, IconRefresh } from '@tabler/icons-react';
import type React from 'react';

export type ErrorCircleIcon = '!' | 'sync' | 'auth';
export const ErrorCircle: React.FC<{ icon?: ErrorCircleIcon }> = ({ icon = '!' }) => {
    return (
        <span className="mx-1 cursor-auto flex h-4 w-4 rounded-full ring-red-base/[.35] ring-4">
            <span className="flex items-center rounded-full bg-red-base h-4 w-4">
                {icon === '!' && <IconExclamationMark className="ml-[2px] h-3 w-3 text-pure-black" />}
                {icon === 'sync' && <IconRefresh className="ml-[2px] h-3 w-3 text-pure-black" />}
                {icon === 'auth' && <IconLock className="ml-[2px] h-3 w-3 text-pure-black" />}
            </span>
        </span>
    );
};
