import { forwardRef } from 'react';

import { Input } from '../../../components/ui/input/Input';
import { cn } from '../../../utils/utils';

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
            <div className={cn('flex flex-col items-start gap-2', className)}>
                {label && (
                    <label htmlFor={props.id} className="text-sm font-medium text-grayscale-300">
                        {label}
                    </label>
                )}
                <Input
                    ref={ref}
                    type="text"
                    variant="border"
                    value={value}
                    placeholder={placeholder}
                    disabled={disabled}
                    before={
                        <div
                            className={cn('w-5 h-5 rounded-sm border-2 border-grayscale-600', disabled && 'opacity-50')}
                            style={{ backgroundColor: previewColor }}
                            title={`Color preview: ${previewColor}`}
                        />
                    }
                    {...props}
                />
            </div>
        );
    }
);

ColorInput.displayName = 'ColorInput';
