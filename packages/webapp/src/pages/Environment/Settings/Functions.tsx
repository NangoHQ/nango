import { IconExternalLink } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import SettingsContent from './components/SettingsContent';
import { apiPostVariables, useEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { KeyValueInput } from '@/components-v2/KeyValueInput';
import { Button } from '@/components-v2/ui/button';

import type { ApiEnvironmentVariable } from '@nangohq/types';

export const Functions: React.FC = () => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const { environmentAndAccount, mutate } = useEnvironment(env);

    const [edit, setEdit] = useState(false);
    const [loading, setLoading] = useState(false);
    const [vars, setVars] = useState<Record<string, string>>(() => {
        if (environmentAndAccount && environmentAndAccount.env_variables.length > 0) {
            return environmentAndAccount.env_variables.reduce<Record<string, string>>((acc, curr) => {
                acc[curr.name] = curr.value;
                return acc;
            }, {});
        }
        return {};
    });
    const [errors, setErrors] = useState<{ index: number; key: 'name' | 'value'; error: string }[]>([]);

    const onSave = async () => {
        setLoading(true);
        const variables: ApiEnvironmentVariable[] = Object.entries(vars).map(([name, value]) => ({ name, value }));
        const res = await apiPostVariables(env, {
            variables
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

        void mutate();

        setEdit(false);
        setErrors([]);
    };

    const onCancel = () => {
        setErrors([]);
        if (environmentAndAccount && environmentAndAccount.env_variables.length > 0) {
            const initialVars = environmentAndAccount.env_variables.reduce<Record<string, string>>((acc, curr) => {
                acc[curr.name] = curr.value;
                return acc;
            }, {});
            setVars(initialVars);
        } else {
            setVars({});
        }
        setEdit(false);
    };

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <SettingsContent title="Functions">
            <div className="flex flex-col gap-2.5">
                <div className="flex">
                    Environment variables
                    <Link className="flex items-center px-1.5" target="_blank" to="https://nango.dev/docs/reference/functions#environment-variables">
                        <IconExternalLink stroke={1} size={18} />
                    </Link>
                </div>
                <div className="flex flex-col gap-5">
                    <fieldset className="flex flex-col gap-3">
                        <KeyValueInput
                            initialValues={vars}
                            onChange={setVars}
                            placeholderKey="MY_ENV_VAR"
                            placeholderValue="value"
                            disabled={!edit || loading}
                            isSecret={true}
                            alwaysShowEmptyRow={edit}
                        />
                        {errors.length > 0 && (
                            <div className="flex flex-col gap-1">
                                {errors.map((err, i) => (
                                    <div key={i} className="text-alert-400 text-s">
                                        Row {err.index + 1}, {err.key}: {err.error}
                                    </div>
                                ))}
                            </div>
                        )}
                    </fieldset>
                    <div className="flex justify-start gap-2">
                        {!edit && (
                            <Button variant="secondary" onClick={() => setEdit(true)}>
                                Edit
                            </Button>
                        )}
                        {edit && (
                            <>
                                <Button variant="tertiary" onClick={onCancel}>
                                    Cancel
                                </Button>
                                <Button variant="primary" onClick={onSave} disabled={loading}>
                                    Save
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </SettingsContent>
    );
};
