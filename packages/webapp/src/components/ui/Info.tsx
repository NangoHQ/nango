import React from 'react';
import { Info as InfoIcon } from '@geist-ui/icons';

interface InfoProps {
    size?: number;
    children: React.ReactNode;
}

export default function Info({ children, size }: InfoProps) {
    return (
        <div className="flex items-center grow p-4 bg-[#15202B] outline outline-1 outline-[#264863] rounded">
            <InfoIcon size={`${size || '36'}`} className="mr-3 stroke-blue-400"></InfoIcon>
            <span className="text-[#C3E5FA]">{children}</span>
        </div>
    );
}
