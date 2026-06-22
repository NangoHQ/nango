import { cn } from '@/lib/utils';
import { useFormField } from './ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export interface SelectProps {
    options: string[];
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
    className?: string;
    name?: string;
    optional?: boolean;
    id?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
}

const CustomSelect: React.FC<SelectProps> = ({
    options,
    placeholder,
    value,
    onChange,
    disabled,
    className,
    name,
    optional,
    id,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedby
}) => {
    const { error } = useFormField();

    const NONE = '__none__';

    return (
        <Select disabled={disabled} name={name} value={value || (optional ? NONE : value)} onValueChange={(v) => onChange?.(v === NONE ? '' : v)}>
            <SelectTrigger
                aria-describedby={ariaDescribedby}
                aria-invalid={ariaInvalid}
                className={cn('w-full', error ? 'border-error focus:border-error focus:ring-red-500/20' : '', className)}
                id={id}
            >
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {optional && <SelectItem value={NONE}>{placeholder}</SelectItem>}
                {options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                        {opt}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};
CustomSelect.displayName = 'Select';

export { CustomSelect };
