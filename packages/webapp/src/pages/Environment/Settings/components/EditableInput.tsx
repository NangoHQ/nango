import { Edit } from 'lucide-react';
import { useState } from 'react';

import { SimpleTooltip } from '@/components/SimpleTooltip';
import { CopyButton } from '@/components/ui/button/CopyButton';
import { Input } from '@/components/ui/input/Input';
import { Button } from '@/components-v2/ui/button';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/utils/utils';

import type { InputProps } from '@/components/ui/input/Input';
import type { ApiError } from '@nangohq/types';
import type { ReactNode } from 'react';

interface EditableInputProps extends InputProps {
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
            <Input
                inputSize={'lg'}
                variant={'black'}
                name={name}
                value={secret && !edit ? '*'.repeat(value.length) : value}
                onChange={(e) => setValue(e.target.value)}
                disabled={loading || !edit}
                className={cn(error && 'border-alert-400')}
                after={
                    !edit && (
                        <div className="flex">
                            {secret && (
                                <div className="py-1">
                                    <CopyButton text={value} />
                                </div>
                            )}
                            {blocked ? (
                                <SimpleTooltip tooltipContent={blockedTooltip} side="top" delay={0}>
                                    <Button variant={'ghost'} size={'sm'} disabled>
                                        <Edit size={18} />
                                    </Button>
                                </SimpleTooltip>
                            ) : (
                                <Button variant={'ghost'} size={'sm'} onClick={() => setEdit(true)}>
                                    <Edit size={18} />
                                </Button>
                            )}
                        </div>
                    )
                }
                {...rest}
            />
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
