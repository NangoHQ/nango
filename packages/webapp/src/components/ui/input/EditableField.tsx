import type React from 'react';
import { useState } from 'react';
import { Pencil1Icon } from '@radix-ui/react-icons';
import { Tooltip } from '@geist-ui/core';
import { cn } from '../../../utils/utils';

interface EditableFieldProps {
    value: string;
    onSave: (newValue: string) => void;
    onChange?: (newValue: string) => void;
    className?: string;
    dark?: boolean;
}

const EditableField: React.FC<EditableFieldProps> = ({ value, onSave, onChange, className, dark = false }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);

    const handleBlur = () => {
        setIsEditing(false);
        onSave(editValue);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setEditValue(newValue);
        if (onChange) {
            onChange(newValue);
        }
    };

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {isEditing ? (
                <input
                    type="text"
                    value={editValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                    autoFocus
                    className="border-border-gray bg-active-gray text-text-light-gray focus:border-white focus:ring-white block w-full appearance-none rounded-md border px-3 py-1 text-sm placeholder-gray-400 shadow-sm focus:outline-none"
                />
            ) : (
                <>
                    <span className="text-white break-all">{value || '-'}</span>
                    <Tooltip text="Edit" type={dark ? 'dark' : 'default'}>
                        <Pencil1Icon onClick={() => setIsEditing(true)} color="gray" className={cn(`h-4 w-4 cursor-pointer`, className)} />
                    </Tooltip>
                </>
            )}
        </div>
    );
};

export default EditableField;
