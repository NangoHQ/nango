import { IconCode, IconEdit, IconTrash } from '@tabler/icons-react';
import { useStore } from '../../../store';
import { apiPostVariables, useEnvironment } from '../../../hooks/useEnvironment';
import { useState } from 'react';
import { Button } from '../../../components/ui/button/Button';
import { Input } from '../../../components/ui/input/Input';
import { cn } from '../../../utils/utils';
import SecretInput from '../../../components/ui/input/SecretInput';
import type { ApiEnvironmentVariable } from '@nangohq/types';
import { useToast } from '../../../hooks/useToast';
import { Link } from 'react-router-dom';

export const VariablesSettings: React.FC = () => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const { environmentAndAccount, mutate } = useEnvironment(env);

    const [edit, setEdit] = useState(false);
    const [loading, setLoading] = useState(false);
    const [vars, setVars] = useState<ApiEnvironmentVariable[]>(() =>
        environmentAndAccount && environmentAndAccount.env_variables.length > 0
            ? JSON.parse(JSON.stringify(environmentAndAccount.env_variables))
            : [{ name: '', value: '' }]
    );
    const [errors, setErrors] = useState<{ index: number; key: 'name' | 'value'; error: string }[]>([]);

    const onEnabledEdit = () => {
        if (vars[vars.length - 1].name !== '') {
            setVars((copy) => [...copy, { name: '', value: '' }]);
        }
        setEdit(true);
    };

    const onUpdate = (key: 'name' | 'value', value: string, index: number) => {
        setVars((copy) => {
            copy[index][key] = value;
            if (copy.length === index + 1 && value !== '') {
                copy[index + 1] = { name: '', value: '' };
            }
            return [...copy];
        });
    };

    const onRemove = (index: number) => {
        if (index === 0 && vars.length === 1) {
            setVars([{ name: '', value: '' }]);
            setErrors([]);
        } else {
            setVars(vars.filter((_, i) => i !== index));
            setErrors(errors.filter((e) => e.index !== index));
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
            variables: vars.filter((v) => v.name !== '' || v.value !== '')
        });

        setLoading(false);

        if ('error' in res.json) {
            toast({ title: 'There was an issue updating the environment variables', variant: 'error' });
            if (res.json.error.code === 'invalid_body' && res.json.error.errors) {
                setErrors(
                    res.json.error.errors.map((err) => {
                        if (err.path[0] !== 'variables') {
                            return null as any;
                        }
                        return { index: err.path[1], key: err.path[2], error: err.message };
                    })
                );
            }
            return;
        }

        toast({ title: 'Environment settings updated successfully!', variant: 'success' });
        void mutate();

        setEdit(false);
        setVars((prev) => (prev.length > 1 ? prev.filter((v) => v.name !== '' || v.value !== '') : prev));
        setErrors([]);
    };

    const onCancel = () => {
        setErrors([]);
        setVars(environmentAndAccount!.env_variables.length > 0 ? JSON.parse(JSON.stringify(environmentAndAccount!.env_variables)) : [{ name: '', value: '' }]);
        setEdit(false);
    };

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <div className="text-grayscale-100 flex flex-col gap-10">
            <Link className="flex gap-2 items-center rounded-md bg-grayscale-900 px-8 h-10" to="#script" id="script">
                <div>
                    <IconCode stroke={1} size={18} />
                </div>
                <h3 className="uppercase text-sm">Script Settings</h3>
            </Link>
            <div className="px-8 flex flex-col gap-10 w-3/5">
                <fieldset className="flex flex-col gap-2.5">
                    <label htmlFor="envvar" className="font-semibold">
                        Environment variables
                    </label>

                    {vars.map((envVar, i) => {
                        const errorName = errors.find((err) => err.index === i && err.key === 'name');
                        const errorValue = errors.find((err) => err.index === i && err.key === 'value');
                        return (
                            <div key={i} className="flex flex-col gap-0.5">
                                <div className="flex gap-4">
                                    <Input
                                        value={envVar.name}
                                        onChange={(e) => onUpdate('name', e.target.value, i)}
                                        inputSize={'lg'}
                                        variant={'black'}
                                        onPaste={(e) => onPaste(e)}
                                        className={cn('w-[200px]', errorName && 'border-alert-400')}
                                        placeholder="MY_ENV_VAR"
                                        disabled={!edit || loading}
                                    />
                                    <SecretInput
                                        value={envVar.value}
                                        onChange={(e) => onUpdate('value', e.target.value, i)}
                                        inputSize={'lg'}
                                        variant={'black'}
                                        onPaste={(e) => onPaste(e)}
                                        className={cn('w-[200px] grow', errorValue && 'border-alert-400')}
                                        placeholder="value"
                                        disabled={!edit || loading}
                                    />
                                    {edit && (
                                        <Button variant={'danger'} size="lg" onClick={() => !loading && onRemove(i)}>
                                            <IconTrash stroke={1} />
                                        </Button>
                                    )}
                                </div>

                                {(errorName || errorValue) && (
                                    <div className="flex gap-2">
                                        <div className="w-[225px]">{errorName && <div className="text-alert-400 text-s">{errorName.error}</div>}</div>
                                        <div className="w-[225px]">{errorValue && <div className="text-alert-400 text-s">{errorValue.error}</div>}</div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <div className="flex justify-end gap-3">
                        {!edit && (
                            <Button variant={'secondary'} onClick={() => onEnabledEdit()}>
                                <IconEdit stroke={1} size={18} /> Edit
                            </Button>
                        )}
                        {edit && (
                            <>
                                <Button variant={'tertiary'} onClick={onCancel}>
                                    Cancel
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
