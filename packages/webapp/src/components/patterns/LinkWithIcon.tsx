import { IconExternalLink, IconLink } from '@tabler/icons-react';
import React from 'react';
import { Link } from 'react-router-dom';

import { cn } from '../utils/utils';

interface LinkWithIconProps {
    to: string;
    children: React.ReactNode;
    type?: 'internal' | 'external';
    className?: string;
    onClick?: () => void;
}

export default function LinkWithIcon({ to, children, type = 'internal', className = '', onClick }: LinkWithIconProps) {
    if (type === 'external') {
        return (
            <a
                href={to}
                className={cn(`text-text-primary text-sm underline inline-flex items-center`, className)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClick}
            >
                {children} <IconExternalLink className="w-4 h-4 ml-1" />
            </a>
        );
    }

    return (
        <Link to={to} className={cn(`text-text-primary text-sm underline inline-flex items-center`, className)} onClick={onClick}>
            {children} <IconLink className="w-4 h-4 ml-1" />
        </Link>
    );
}
