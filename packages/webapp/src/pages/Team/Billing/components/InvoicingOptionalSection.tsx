import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';

import { IconButton } from '@nangohq/design-system';

import { OptionalTag } from './InvoicingDetailsForm';

export const InvoicingOptionalSection: React.FC<{
    title: string;
    present: boolean;
    onAdd: () => void;
    onRemove: () => void;
    addLabel: string;
    removeLabel: string;
    children: React.ReactNode;
}> = ({ title, present, onAdd, onRemove, addLabel, removeLabel, children }) => {
    const contentId = useId();

    return (
        <div className="border-t border-border-muted">
            <div className="p-4 flex items-center justify-between">
                <span className="flex items-center gap-2 text-text-strong text-body-medium-regular">
                    {title}
                    <OptionalTag />
                </span>
                {present ? (
                    <IconButton type="button" variant="ghost" size="2xs" onClick={onRemove} label={removeLabel} aria-expanded={true} aria-controls={contentId}>
                        <Trash2 />
                    </IconButton>
                ) : (
                    <IconButton type="button" variant="ghost" size="2xs" onClick={onAdd} label={addLabel} aria-expanded={false} aria-controls={contentId}>
                        <Plus />
                    </IconButton>
                )}
            </div>
            {present && (
                <div id={contentId} className="px-4 pb-4">
                    {children}
                </div>
            )}
        </div>
    );
};
