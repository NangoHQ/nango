import type { ReactNode } from 'react';
import { useState } from 'react';
import type { InputProps } from '../../../components/ui/input/Input';
import { Input } from '../../../components/ui/input/Input';
import { cn } from '../../../utils/utils';
import { Button } from '../../../components/ui/button/Button';
import { IconEdit, IconExternalLink } from '@tabler/icons-react';
import { useToast } from '../../../hooks/useToast';
import type { ApiError } from '@nangohq/types';
import { Link } from 'react-router-dom';
import { CopyButton } from '../../../components/ui/button/CopyButton';

export const EditableInput: React.FC<
    {
        title: string;
        subTitle?: boolean;
        secret?: boolean;
        name: string;
        originalValue: string;
        docs?: string;
        editInfo?: ReactNode;
        apiCall: (val: string) => Promise<{ json: ApiError<'invalid_body'> | Record<string, any> }>;
        onSuccess: () => void;
    } & InputProps
> = ({ title, subTitle, secret, name, originalValue, docs, editInfo, apiCall, onSuccess, ...rest }) => {
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
            toast({ title: `There was an issue updating the ${title}`, variant: 'error' });
            if (res.json.error.code === 'invalid_body' && res.json.error.errors && res.json.error.errors[0]) {
                setError(res.json.error.errors[0].message);
            }
            return;
        }

        toast({ title: `${title} updated successfully!`, variant: 'success' });
        onSuccess();

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
                disabled={loading || !edit}
                className={cn(error && 'border-alert-400')}
                after={
                    !edit && (
                        <div className="flex">
                            {secret && <CopyButton text={value} />}
                            <Button variant={'icon'} size={'xs'} onClick={() => setEdit(true)}>
                                <IconEdit stroke={1} size={18} />
                            </Button>
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
