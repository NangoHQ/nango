import { forwardRef, useState } from 'react';

import { Input } from '../../../components/ui/input/Input';
import { cn } from '../../../utils/utils';

import type { InputHTMLAttributes } from 'react';

export interface ColorInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
    value?: string;
    onChange?: (value: string) => void;
    onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
    label?: string;
}

const isValidCSSColor = (color: string): boolean => {
    if (!color) return false;

    // Create a temporary element to test the color
    const tempElement = document.createElement('div');
    tempElement.style.color = color;

    // If the color is invalid, the browser will ignore it and keep the default
    return tempElement.style.color !== '';
};

export const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(
    ({ value = '', onChange, onBlur, className, placeholder = '#000000', disabled, label, ...props }, ref) => {
        const [isValid, setIsValid] = useState(true);
        const [displayValue, setDisplayValue] = useState(value);

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const newValue = e.target.value;
            setDisplayValue(newValue);

            // Validate the color
            const valid = newValue === '' || isValidCSSColor(newValue);
            setIsValid(valid);

            if (onChange) {
                onChange(newValue);
            }
        };

        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            // Final validation on blur
            const valid = displayValue === '' || isValidCSSColor(displayValue);
            setIsValid(valid);

            if (onBlur) {
                onBlur(e);
            }
        };

        // Use the display value for the preview, fallback to a default color if invalid
        const previewColor = displayValue && isValidCSSColor(displayValue) ? displayValue : '#000000';

        return (
            <div className={cn('flex flex-col gap-2', className)}>
                {label && (
                    <label htmlFor={props.id} className="text-sm font-medium text-grayscale-300">
                        {label}
                    </label>
                )}
                <Input
                    ref={ref}
                    type="text"
                    variant="border"
                    value={displayValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder={placeholder}
                    disabled={disabled}
                    before={
                        <div
                            className={cn('w-5 h-5 rounded border-2 border-grayscale-600', !isValid && 'border-red-500', disabled && 'opacity-50')}
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
