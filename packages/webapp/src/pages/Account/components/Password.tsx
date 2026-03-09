import { CheckIcon, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import z from 'zod';

import { FormControl, FormItem, FormMessage, useFormField } from '@/components-v2/ui/form';
import { InputGroup, InputGroupInput } from '@/components-v2/ui/input-group';
import { cn } from '@/utils/utils';

export const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine((value) => /[A-Z]/.test(value), 'Password must contain at least one uppercase letter')
    .refine((value) => /[0-9]/.test(value), 'Password must contain at least one number')
    .refine((value) => /[^a-zA-Z0-9]/.test(value), 'Password must contain at least one special character');

export const Password: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
    const { name } = useFormField();
    const { control } = useFormContext();
    const { field, fieldState } = useController({ name, control });

    const [open, setOpen] = useState(false);

    const value = String(field.value ?? '');

    const checks = useMemo(
        () => ({
            length: value.length >= 8,
            uppercase: value.match(/[A-Z]/) !== null,
            number: value.match(/[0-9]/) !== null,
            special: value.match(/[^a-zA-Z0-9]/) !== null
        }),
        [value]
    );

    return (
        <FormItem>
            <FormControl>
                <InputGroup className="h-11">
                    <InputGroupInput
                        {...field}
                        id={field.name}
                        type="password"
                        placeholder="Password"
                        aria-invalid={!!fieldState.error}
                        aria-describedby="password-requirements"
                        onFocus={() => {
                            setOpen(true);
                        }}
                        {...props}
                    />
                </InputGroup>
            </FormControl>
            <FormMessage />

            <div
                id="password-requirements"
                className={cn('flex flex-col gap-1.5 overflow-hidden transition-[max-height] duration-200 ease-out', open ? 'max-h-40' : 'max-h-0 absolute')}
            >
                <span className="text-body-small-regular text-text-primary">Password must contain:</span>
                <Requirement text="At least 8 characters" check={checks.length} />
                <Requirement text="At least one uppercase letter" check={checks.uppercase} />
                <Requirement text="At least one number" check={checks.number} />
                <Requirement text="At least one special character" check={checks.special} />
            </div>
        </FormItem>
    );
};

const Requirement: React.FC<{ text: string; check: boolean }> = ({ text, check }) => {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 !text-body-small-regular text-text-primary',
                check ? 'text-feedback-success-fg' : 'text-text-tertiary'
            )}
        >
            {check ? <CheckIcon className="size-4" /> : <X className="size-4" />}
            {text}
        </span>
    );
};
