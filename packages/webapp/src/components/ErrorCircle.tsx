import { XMarkIcon, ArrowPathIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import type React from 'react';

export type ErrorCircleIcon = 'x' | 'sync' | 'auth';
export const ErrorCircle: React.FC<{ icon?: ErrorCircleIcon }> = ({ icon = 'x' }) => {
    return (
        <span className="mx-1 cursor-auto flex h-4 w-4 rounded-full ring-red-base/[.35] ring-4">
            <span className="flex items-center rounded-full bg-red-base h-4 w-4">
                {icon === 'x' && <XMarkIcon className="ml-[2px] h-3 w-3 text-pure-black" />}
                {icon === 'sync' && <ArrowPathIcon className="ml-[2px] h-3 w-3 text-pure-black" />}
                {icon === 'auth' && <LockClosedIcon className="ml-[2px] h-3 w-3 text-pure-black" />}
            </span>
        </span>
    );
};
