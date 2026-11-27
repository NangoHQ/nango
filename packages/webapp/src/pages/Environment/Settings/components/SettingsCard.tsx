import { Button, Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@nangohq/design-system';

import { cn } from '@/utils/utils';

import type { CardProps } from '@nangohq/design-system';
import type { ReactNode } from 'react';

interface SettingsCardProps {
    title?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    dirty?: boolean;
    invalid?: boolean;
    saving?: boolean;
    canEdit?: boolean;
    onSave?: () => void | Promise<void>;
    onDiscard?: () => void;
    footer?: ReactNode;
    variant?: CardProps['variant'];
}

export const SettingsCard: React.FC<SettingsCardProps> = ({
    title,
    action,
    children,
    dirty = false,
    invalid = false,
    saving = false,
    canEdit = true,
    onSave,
    onDiscard,
    footer,
    variant
}) => {
    const showSaveFooter = dirty && canEdit && !!onSave;

    return (
        <Card variant={variant}>
            {title && (
                <CardHeader>
                    <CardTitle>
                        <h2 className="type-text-medium-md">{title}</h2>
                    </CardTitle>
                    {action && <CardAction>{action}</CardAction>}
                </CardHeader>
            )}
            <CardContent>
                <div className={cn('flex flex-col gap-5', !title && 'pt-4')}>{children}</div>
            </CardContent>
            {showSaveFooter && (
                <CardFooter>
                    <div className="flex w-full items-center justify-between gap-3">
                        <span className="type-text-regular-xs text-status-warning-text" aria-live="polite">
                            Unsaved changes
                        </span>
                        <div className="flex items-center gap-2">
                            {onDiscard && (
                                <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
                                    Discard
                                </Button>
                            )}
                            <Button variant="primary" size="sm" onClick={() => void onSave()} disabled={invalid} loading={saving}>
                                Save
                            </Button>
                        </div>
                    </div>
                </CardFooter>
            )}
            {!showSaveFooter && footer && (
                <CardFooter>
                    <div className="flex w-full items-center justify-between gap-3">{footer}</div>
                </CardFooter>
            )}
        </Card>
    );
};

interface SettingsRowProps {
    label: ReactNode;
    description?: ReactNode;
    htmlFor?: string;
    children: ReactNode;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({ label, description, htmlFor, children }) => {
    const labelNode = <span className="block type-text-medium-sm text-text-default">{label}</span>;
    return (
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] items-start">
            <div className="md:pt-1.5">
                {htmlFor ? <label htmlFor={htmlFor}>{labelNode}</label> : labelNode}
                {description && <span className="mt-0.5 block type-text-regular-xs text-text-secondary">{description}</span>}
            </div>
            <div className="flex min-w-0 flex-col gap-2">{children}</div>
        </div>
    );
};
