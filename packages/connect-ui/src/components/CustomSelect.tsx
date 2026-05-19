import { useFormField } from './ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from '@/lib/utils';

export interface SelectProps {
    options: string[];
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
    className?: string;
    name?: string;
}

const CustomSelect: React.FC<SelectProps> = ({ options, placeholder, value, onChange, disabled, className, name }) => {
    const { error } = useFormField();

    return (
        <Select disabled={disabled} name={name} value={value} onValueChange={onChange}>
            <SelectTrigger className={cn('w-full', error ? 'border-error focus:border-error focus:ring-red-500/20' : '', className)}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
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
