import { cva } from 'class-variance-authority';
import { ExternalLink, LinkIcon } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';

import type { VariantProps } from 'class-variance-authority';

const styledLinkVariants = cva(
    'w-fit text-sm underline inline-flex items-center cursor-pointer focus-default disabled:text-link-disabled disabled:[&_svg]:text-link-disabled',
    {
        variants: {
            variant: {
                default:
                    'text-link-default [&_svg]:text-link-disabled hover:text-link-hover hover:[&_svg]:text-link-hover active:text-link-press active:[&_svg]:text-link-press disabled:text-link-disabled disabled:[&_svg]:text-link-disabled',
                error: 'text-feedback-error-fg [&_svg]:text-feedback-error-fg'
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
            type: 'internal',
            icon: false
        }
    }
);

interface StyledLinkProps extends VariantProps<typeof styledLinkVariants> {
    to: string;
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    title?: string;
}

export const StyledLink: React.FC<StyledLinkProps> = ({ to, children, type = 'internal', icon = false, variant, className = '', onClick, title }) => {
    const linkClasses = styledLinkVariants({ type, icon, className, variant });

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
