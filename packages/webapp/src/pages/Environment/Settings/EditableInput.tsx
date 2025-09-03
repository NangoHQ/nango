import { IconEdit, IconExternalLink } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { SimpleTooltip } from '../../../components/SimpleTooltip';
import { Button } from '../../../components/ui/button/Button';
import { CopyButton } from '../../../components/ui/button/CopyButton';
import { Input } from '../../../components/ui/input/Input';
import { useToast } from '../../../hooks/useToast';
import { cn } from '../../../utils/utils';

import type { InputProps } from '../../../components/ui/input/Input';
import type { ApiError } from '@nangohq/types';
import type { ReactNode } from 'react';

interface EditableInputProps extends InputProps {
    title: string;
    subTitle?: boolean;
    secret?: boolean;
    name: string;
    originalValue: string;
    docs?: string;
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
    docs,
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

        toast({ title: `${title} updated successfully!`, variant: 'success' });
        onSuccess(value);

        setEdit(false);
        setError(null);
    };

    return (
        <fieldset className={cn('flex flex-col gap-2.5')}>
            {docs ? (
                <Link to={docs} className="flex gap-2 items-center" target="_blank">
                    <label htmlFor={name} className={cn(!subTitle ? 'font-semibold' : 'text-s -mb-2')}>
                        {title}
                    </label>
                    <IconExternalLink stroke={1} size={18} />
                </Link>
            ) : (
                <label htmlFor={name} className={cn(!subTitle ? 'font-semibold' : 'text-s -mb-2')}>
                    {title}
                </label>
            )}
            <Input
                inputSize={'lg'}
                variant={'black'}
                name={name}
                value={secret && !edit ? '*'.repeat(value.length) : value}
                onChange={(e) => setValue(e.target.value)}
                disabled={loading}
                className={cn(error && 'border-alert-400')}
                after={
                    !edit && (
                        <div className="flex">
                            {secret && <CopyButton text={value} />}
                            {blocked ? (
                                <SimpleTooltip tooltipContent={blockedTooltip} side="top" delay={0}>
                                    <Button variant={'icon'} size={'xs'} disabled>
                                        <IconEdit stroke={1} size={18} />
                                    </Button>
                                </SimpleTooltip>
                            ) : (
                                <Button variant={'icon'} size={'xs'} onClick={() => setEdit(true)}>
                                    <IconEdit stroke={1} size={18} />
                                </Button>
                            )}
                        </div>
                    )
                }
                {...rest}
            />
            {error && <div className="text-alert-400 text-s">{error}</div>}
            {edit && editInfo}
            <div className="flex justify-end gap-3">
                {edit && (
                    <>
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
                        <Button variant={'primary'} onClick={onSave} isLoading={loading}>
                            Save
                        </Button>
                    </>
                )}
            </div>
        </fieldset>
    );
};
