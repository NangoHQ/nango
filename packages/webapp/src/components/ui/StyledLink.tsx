import { cva } from 'class-variance-authority';
import { ExternalLink, LinkIcon } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';

import type { VariantProps } from 'class-variance-authority';

const styledLinkVariants = cva('w-fit inline-flex items-center cursor-pointer focus-default disabled:text-text-disabled disabled:[&_svg]:text-text-disabled', {
    variants: {
        variant: {
            default:
                'text-text-link [&_svg]:text-text-link hover:text-text-link-hover hover:[&_svg]:text-text-link-hover active:text-text-link-active active:[&_svg]:text-text-link-active disabled:text-text-disabled disabled:[&_svg]:text-text-disabled',
            info: 'text-status-info-text [&_svg]:text-status-info-text',
            error: 'text-status-danger-text [&_svg]:text-status-danger-text'
        },
        size: {
            default: 'text-body-medium-medium',
            sm: 'text-body-small-medium'
        },
        type: {
            internal: '',
            external: ''
        },
        icon: {
            true: '',
            false: ''
        }
    },
    defaultVariants: {
        variant: 'default',
        size: 'default',
        type: 'internal',
        icon: false
    }
});

interface StyledLinkProps extends VariantProps<typeof styledLinkVariants> {
    to: string;
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    title?: string;
}

export const StyledLink: React.FC<StyledLinkProps> = ({ to, children, type = 'internal', icon = false, variant, size, className = '', onClick, title }) => {
    const linkClasses = styledLinkVariants({ type, icon, className, variant, size });

    if (type === 'external') {
        return (
            <a href={to} className={linkClasses} target="_blank" rel="noopener noreferrer" onClick={onClick} title={title}>
                {children} {icon && <ExternalLink className="size-3.5 ml-1" />}
            </a>
        );
    }

    return (
        <Link to={to} className={linkClasses} onClick={onClick} title={title}>
            {children} {icon && <LinkIcon className="size-3.5  ml-1" />}
        </Link>
    );
};
