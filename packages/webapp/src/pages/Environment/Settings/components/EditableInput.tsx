import { Edit } from 'lucide-react';
import { useState } from 'react';

import { SimpleTooltip } from '@/components/ui/SimpleTooltip';
import { CopyButton } from '@/components/ui/button/CopyButton';
import { Button } from '@/components-v2/ui/Button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components-v2/ui/InputGroup';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/utils';

import type { ApiError } from '@nangohq/types';
import type { ComponentProps, ReactNode } from 'react';

interface EditableInputProps extends ComponentProps<'input'> {
    title?: string;
    subTitle?: boolean;
    secret?: boolean;
    name: string;
    originalValue: string;
    editInfo?: ReactNode;
    blocked?: boolean;
    blockedTooltip?: string;
    apiCall: (val: string) => Promise<{ json: ApiError<'invalid_body'> | Record<string, any> }>;
    onSuccess: (name: string) => void;
}

export const EditableInput: React.FC<EditableInputProps> = ({
    title,
    subTitle,
    secret,
    name,
    originalValue,
    editInfo,
    apiCall,
    onSuccess,
    blocked,
    blockedTooltip,
    ...rest
}) => {
    const { toast } = useToast();

    const [value, setValue] = useState<string>(() => originalValue);
    const [edit, setEdit] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSave = async () => {
        setLoading(true);
        const res = await apiCall(value);
        setLoading(false);

        if ('error' in res.json) {
            if (res.json.error.code === 'forbidden') {
                toast({ title: res.json.error.message, variant: 'error' });
            } else {
                toast({ title: `There was an issue updating the ${title}`, variant: 'error' });
            }
            if (res.json.error.code === 'invalid_body' && res.json.error.errors && res.json.error.errors[0]) {
                setError(res.json.error.errors[0].message);
            }
            return;
        }

        onSuccess(value);

        setEdit(false);
        setError(null);
    };

    return (
        <fieldset className={cn('flex flex-col gap-3.5')}>
            {title && (
                <label htmlFor={name} className={cn(!subTitle ? 'font-semibold' : 'text-sm -mb-2')}>
                    {title}
                </label>
            )}
            <InputGroup
                className={cn(
                    'h-[42px] bg-pure-black border-grayscale-600 hover:border-grayscale-500 focus-within:bg-grayscale-900',
                    error && 'border-alert-400'
                )}
            >
                <InputGroupInput
                    name={name}
                    value={secret && !edit ? '*'.repeat(value.length) : value}
                    onChange={(e) => setValue(e.target.value)}
                    disabled={loading || !edit}
                    {...rest}
                />
                {!edit && (
                    <InputGroupAddon align="inline-end">
                        <div className="flex">
                            {secret && (
                                <div className="py-1">
                                    <CopyButton text={value} />
                                </div>
                            )}
                            {blocked ? (
                                <SimpleTooltip tooltipContent={blockedTooltip} side="top" delay={0}>
                                    <InputGroupButton variant={'ghost'} size={'icon-sm'} disabled>
                                        <Edit size={18} />
                                    </InputGroupButton>
                                </SimpleTooltip>
                            ) : (
                                <InputGroupButton variant={'ghost'} size={'icon-sm'} onClick={() => setEdit(true)}>
                                    <Edit size={18} />
                                </InputGroupButton>
                            )}
                        </div>
                    </InputGroupAddon>
                )}
            </InputGroup>
            {error && <div className="text-alert-400 text-s">{error}</div>}
            {edit && editInfo}
            {edit && (
                <div className="flex justify-start gap-2">
                    <Button
                        variant={'tertiary'}
                        onClick={() => {
                            setValue(originalValue);
                            setEdit(false);
                            setError(null);
                        }}
                    >
                        Cancel
                    </Button>
                    <Button variant={'primary'} onClick={onSave} disabled={loading}>
                        Save
                    </Button>
                </div>
            )}
        </fieldset>
    );
};
