import { useState } from 'react';

import { InlineCode } from '@nangohq/design-system';

import { DocsIconLink } from '@/components/patterns/DocsIconLink';
import { KeyValueInput } from '@/components/patterns/KeyValueInput';
import { usePermissions } from '@/hooks/usePermissions';
import { useEnvironment, usePostVariables } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { RowErrors, rowErrorsFromApi } from './components/RowErrors';
import { SettingsCard } from './components/SettingsCard';
import { sameRecord } from './utils';

import type { RowError } from './components/RowErrors';
import type { ApiEnvironmentVariable } from '@nangohq/types';

function toRecord(variables: ApiEnvironmentVariable[]): Record<string, string> {
    return Object.fromEntries(variables.map((v) => [v.name, v.value]));
}

export const Functions: React.FC = () => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const { mutateAsync: postVariablesAsync, isPending } = usePostVariables(env);

    const { can } = usePermissions();
    const canEdit = can('environment:variables:update');

    const saved = toRecord(environmentAndAccount?.env_variables ?? []);
    const [vars, setVars] = useState<Record<string, string>>(saved);
    const [resetKey, setResetKey] = useState(0);
    const [errors, setErrors] = useState<RowError[]>([]);

    if (!environmentAndAccount) {
        return null;
    }

    const dirty = !sameRecord(vars, saved);

    const onSave = async () => {
        const variables: ApiEnvironmentVariable[] = Object.entries(vars).map(([name, value]) => ({ name, value }));
        try {
            await postVariablesAsync({ variables });
            setErrors([]);
            toast({ title: 'Environment variables saved', variant: 'success' });
        } catch (err) {
            setErrors(rowErrorsFromApi(err, 'variables'));
            toast({ title: 'Failed to save environment variables', variant: 'error' });
        }
    };

    return (
        <SettingsCard
            title={
                <span className="inline-flex items-center gap-1.5">
                    Environment variables
                    <DocsIconLink
                        href="https://nango.dev/docs/reference/functions/functions-sdk#environment-variables"
                        label="Environment variables documentation"
                    />
                </span>
            }
            dirty={dirty}
            saving={isPending}
            canEdit={canEdit}
            onSave={onSave}
            onDiscard={() => {
                setVars(saved);
                setErrors([]);
                setResetKey((k) => k + 1);
            }}
        >
            <p className="type-text-regular-sm text-text-secondary">
                Values your functions read at runtime with <InlineCode>nango.getEnvironmentVariables()</InlineCode>.
            </p>
            <KeyValueInput
                key={resetKey}
                initialValues={vars}
                onChange={setVars}
                placeholderKey="MY_VARIABLE"
                placeholderValue="value"
                disabled={!canEdit}
                isSecret
                mono
                columnLabels={['Name', 'Value']}
                addLabel="Add variable"
            />
            <RowErrors errors={errors} />
        </SettingsCard>
    );
};
