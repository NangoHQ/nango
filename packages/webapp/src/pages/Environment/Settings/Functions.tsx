import { ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { permissions } from '@nangohq/authz';

import SettingsContent from './components/SettingsContent';
import { useEnvironment, usePostVariables } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { APIError } from '../../../utils/api';
import { KeyValueInput } from '@/components-v2/KeyValueInput';
import { PermissionGate } from '@/components-v2/PermissionGate';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { usePermissions } from '@/hooks/usePermissions';

import type { ApiEnvironmentVariable } from '@nangohq/types';

export const Functions: React.FC = () => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const environment = environmentAndAccount?.environment;
    const { mutateAsync: postVariablesAsync, isPending } = usePostVariables(env);

    const { can } = usePermissions();
    const canEditEnvironmentVars = can(permissions.canWriteProdEnvironmentVariables) || !environment?.is_production;

    const [edit, setEdit] = useState(false);
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
        const variables: ApiEnvironmentVariable[] = Object.entries(vars).map(([name, value]) => ({ name, value }));
        try {
            await postVariablesAsync({ variables });
            setEdit(false);
            setErrors([]);
        } catch (err) {
            toast({ title: 'There was an issue updating the environment variables', variant: 'error' });
            if (err instanceof APIError && 'error' in err.json && err.json.error.code === 'invalid_body' && err.json.error.errors) {
                setErrors(
                    err.json.error.errors.map((e: any) => {
                        if (e.path[0] !== 'variables') {
                            return null as any;
                        }
                        return { index: e.path[1], key: e.path[2], error: e.message };
                    })
                );
            }
        }
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
                <div className="inline-flex items-center gap-2">
                    Environment variables
                    <ButtonLink variant="ghost" size="icon" target="_blank" to="https://nango.dev/docs/reference/functions/functions-sdk#environment-variables">
                        <ExternalLink />
                    </ButtonLink>
                </div>
                <div className="flex flex-col gap-5">
                    <fieldset className="flex flex-col gap-3">
                        <KeyValueInput
                            initialValues={vars}
                            onChange={setVars}
                            placeholderKey="MY_ENV_VAR"
                            placeholderValue="value"
                            disabled={!edit || isPending}
                            isSecret={true}
                            alwaysShowEmptyRow={edit}
                        />
                        {errors.length > 0 && (
                            <div className="flex flex-col gap-1">
                                {errors.map((err, i) => (
                                    <div key={i} className="text-body-small-regular text-feedback-error-fg">
                                        Row {err.index + 1}, {err.key}: {err.error}
                                    </div>
                                ))}
                            </div>
                        )}
                    </fieldset>
                    <div className="flex justify-start gap-2">
                        {!edit && (
                            <PermissionGate asChild condition={canEditEnvironmentVars}>
                                {(allowed) => (
                                    <Button variant="secondary" onClick={() => setEdit(true)} disabled={!allowed}>
                                        Edit
                                    </Button>
                                )}
                            </PermissionGate>
                        )}
                        {edit && (
                            <>
                                <Button variant="tertiary" onClick={onCancel}>
                                    Cancel
                                </Button>
                                <Button variant="primary" onClick={onSave} disabled={isPending}>
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
