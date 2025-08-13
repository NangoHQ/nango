import { IconExternalLink, IconLink } from '@tabler/icons-react';
import React from 'react';
import { Link } from 'react-router-dom';

interface LinkWithIconProps {
    to: string;
    children: React.ReactNode;
    type?: 'internal' | 'external';
    className?: string;
}

export default function LinkWithIcon({ to, children, type = 'internal', className = '' }: LinkWithIconProps) {
    if (type === 'external') {
        return (
            <a href={to} className={`text-text-primary text-sm underline flex items-center ${className}`} target="_blank" rel="noopener noreferrer">
                {children} <IconExternalLink className="w-4 h-4 ml-1" />
            </a>
        );
    }

    return (
        <Link to={to} className={`text-text-primary text-sm underline flex items-center ${className}`}>
            {children} <IconLink className="w-4 h-4 ml-1" />
        </Link>
    );
}
