import { IconEdit, IconServer, IconTrash } from '@tabler/icons-react';
import { useStore } from '../../../store';
import { apiPostVariables, useEnvironment } from '../../../hooks/useEnvironment';
import { useState } from 'react';
import { Button } from '../../../components/ui/button/Button';
import { Input } from '../../../components/ui/input/Input';
import { cn } from '../../../utils/utils';
import SecretInput from '../../../components/ui/input/SecretInput';
import type { ApiEnvironmentVariable } from '@nangohq/types';
import { useToast } from '../../../hooks/useToast';

export const VariablesSettings: React.FC = () => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const { environmentAndAccount, mutate } = useEnvironment(env);

    const [edit, setEdit] = useState(false);
    const [loading, setLoading] = useState(false);
    const [vars, setVars] = useState<ApiEnvironmentVariable[]>(() =>
        environmentAndAccount!.env_variables.length > 0 ? JSON.parse(JSON.stringify(environmentAndAccount!.env_variables)) : [{ name: '', value: '' }]
    );
    const [errors, setErrors] = useState<{ name: string; error: string }[]>([]);

    const onUpdate = (key: 'name' | 'value', value: string, index: number) => {
        setVars((copy) => {
            copy[index][key] = value;
            return [...copy];
        });
    };

    const onRemove = (index: number) => {
        if (index === 0 && vars.length === 1) {
            setVars([{ name: '', value: '' }]);
        } else {
            setVars(vars.filter((_, i) => i !== index));
        }
    };

    const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const filtered = handlePastedEnv(
            e.clipboardData.getData('Text'),
            vars.map((v) => v.name)
        );
        if (!filtered || filtered.size === 0) {
            return;
        }

        setVars((prev) => {
            const copy = [...prev].filter((v) => v.value !== '');
            const next = Array.from(filtered);

            copy.push(...next.map((v) => ({ name: v[0], value: v[1] })));
            copy.push({ name: '', value: '' });
            return copy;
        });
    };

    const onSave = async () => {
        setLoading(true);
        const res = await apiPostVariables(env, {
            variables: vars
        });

        if ('error' in res.json) {
            toast({ title: 'There was an issue updating the webhook settings', variant: 'error' });
            setLoading(false);
            if (res.json.error.code === 'invalid_body') {
                setErrors(res.json.error.errors as any);
            }
            return;
        }

        toast({ title: 'Webhook settings updated successfully!', variant: 'success' });
        mutate();

        setLoading(false);
    };
    const onCancel = () => {
        console.log(environmentAndAccount);
        setErrors([]);
        setVars(environmentAndAccount!.env_variables);
        setEdit(false);
    };

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <div className="text-grayscale-100 flex flex-col gap-10">
            <div className="flex gap-2 items-center rounded-md bg-grayscale-900 px-8 h-10">
                <div>
                    <IconServer stroke={1} size={18} />
                </div>
                <h3 className="uppercase text-sm">Script Settings</h3>
            </div>
            <div className="px-8 flex flex-col gap-10 w-3/5">
                <fieldset className="flex flex-col gap-4">
                    <label htmlFor="envvar" className="font-semibold">
                        Environment variables
                    </label>

                    <div className="flex flex-col gap-2">
                        {vars.map((envVar, i) => {
                            const error = errors.find((err) => err.name === envVar.name);
                            return (
                                <div key={i} className="flex flex-col gap-0.5">
                                    <div className="flex gap-2">
                                        <Input
                                            value={envVar.name}
                                            onChange={(e) => onUpdate('name', e.target.value, i)}
                                            inputSize={'lg'}
                                            variant={'black'}
                                            onPaste={(e) => onPaste(e)}
                                            className={cn('w-[225px]', error && 'border-red-base')}
                                            placeholder="MY_ENV_VAR"
                                            readOnly={!edit && !loading}
                                        />
                                        <SecretInput
                                            value={envVar.value}
                                            onChange={(e) => onUpdate('value', e.target.value, i)}
                                            inputSize={'lg'}
                                            variant={'black'}
                                            onPaste={(e) => onPaste(e)}
                                            className={cn('w-[225px] grow', error && 'border-red-base')}
                                            placeholder="value"
                                            readOnly={!edit && !loading}
                                        />
                                        {edit ? (
                                            <Button variant={'icon'} size="lg" onClick={() => !loading && onRemove(i)}>
                                                <IconTrash stroke={1} />
                                            </Button>
                                        ) : (
                                            <div></div>
                                        )}
                                    </div>
                                    {error && <div className="text-red-base text-sm">{error.error}</div>}
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-end gap-2">
                        {!edit && (
                            <Button variant={'secondary'} onClick={() => setEdit(true)}>
                                <IconEdit stroke={1} /> Edit
                            </Button>
                        )}
                        {edit && (
                            <>
                                <Button variant={'emptyFaded'} onClick={onCancel}>
                                    cancel
                                </Button>
                                <Button variant={'primary'} onClick={onSave} isLoading={loading}>
                                    Save
                                </Button>
                            </>
                        )}
                    </div>
                </fieldset>
            </div>
        </div>
    );
};

function handlePastedEnv(clip: string, prev: string[]) {
    if (!clip) {
        return;
    }

    const split = clip.split(/[\n, ]/g);

    const filtered = new Map<string, string>();
    for (const item of split) {
        if (!item.includes('=')) {
            continue;
        }

        const line = item.split('=');
        if (line.length > 2 || line[0] === '') {
            continue;
        }

        const name = line[0].trim();
        const value = line[1] ? line[1].trim().replaceAll(/['"]/g, '') : '';

        // dedup
        if (prev.find((v) => v === name)) {
            continue;
        }

        filtered.set(name, value);
    }
    return filtered;
}
