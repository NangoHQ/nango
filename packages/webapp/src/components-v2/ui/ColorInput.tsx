import { forwardRef } from 'react';

import { Input as _Input } from '@/components-v2/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { cn } from '@/utils/utils';

import type { InputHTMLAttributes } from 'react';

export const isValidCSSColor = (color: string): boolean => {
    if (!color) return false;

    // Create a temporary element to test the color
    const tempElement = document.createElement('div');
    tempElement.style.color = color;

    // If the color is invalid, the browser will ignore it and keep the default
    return tempElement.style.color !== '';
};

export interface ColorInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> {
    value: string;
    className?: string;
    placeholder?: string;
    label?: string;
}

export const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(
    ({ value = '', className, placeholder = '#000000', disabled, label, ...props }, ref) => {
        // Use the display value for the preview, fallback to a default color if invalid
        const previewColor = value && isValidCSSColor(value) ? value : '#000000';

        return (
            <InputGroup>
                <InputGroupInput value={value} ref={ref} type="text" placeholder={placeholder} disabled={disabled} {...props} />
                <InputGroupAddon>
                    <div
                        className={cn('w-5 h-5 rounded-sm border-2 border-bg-muted', disabled && 'opacity-50')}
                        style={{ backgroundColor: previewColor }}
                        title={`Color preview: ${previewColor}`}
                    />
                </InputGroupAddon>
            </InputGroup>
        );
    }
);

ColorInput.displayName = 'ColorInput';
