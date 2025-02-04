import type { ReactNode } from 'react';
import { useState } from 'react';
import type { InputProps } from '../../../components/ui/input/Input';
import { Input } from '../../../components/ui/input/Input';
import { cn } from '../../../utils/utils';
import { Button } from '../../../components/ui/button/Button';
import { IconEdit } from '@tabler/icons-react';
import { useToast } from '../../../hooks/useToast';
import type { ApiError } from '@nangohq/types';
import SecretInput from '../../../components/ui/input/SecretInput';

export const EditableInput: React.FC<
    {
        title: string;
        subTitle?: boolean;
        secret?: boolean;
        name: string;
        originalValue: string;
        editInfo?: ReactNode;
        apiCall: (val: string) => Promise<{ json: ApiError<'invalid_body'> | Record<string, any> }>;
        onSuccess: () => void;
    } & InputProps
> = ({ title, subTitle, secret, name, originalValue, editInfo, apiCall, onSuccess, ...rest }) => {
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

    const TInput = (secret ? SecretInput : Input) as typeof Input;

    return (
        <fieldset className={cn('flex flex-col gap-2')}>
            <label htmlFor={name} className={cn(!subTitle ? 'font-semibold mb-2' : 'text-s')}>
                {title}
            </label>
            <TInput
                inputSize={'lg'}
                variant={'black'}
                name={name}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={loading || !edit}
                className={cn(error && 'border-alert-400')}
                {...rest}
            />
            {error && <div className="text-alert-400 text-s">{error}</div>}
            <div className="flex justify-end gap-2">
                {!edit && (
                    <Button variant={'secondary'} size={'sm'} onClick={() => setEdit(true)}>
                        <IconEdit stroke={1} size={18} /> Edit
                    </Button>
                )}
                {edit && (
                    <>
                        <Button
                            variant={'tertiary'}
                            size={'sm'}
                            onClick={() => {
                                setValue(originalValue);
                                setEdit(false);
                                setError(null);
                            }}
                        >
                            cancel
                        </Button>
                        <Button variant={'primary'} size={'sm'} onClick={onSave} isLoading={loading}>
                            Save
                        </Button>
                    </>
                )}
            </div>
            {edit && editInfo}
        </fieldset>
    );
};
