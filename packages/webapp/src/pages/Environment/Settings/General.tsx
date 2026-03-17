import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DeleteButton } from './components/DeleteButton';
import { EditableInput } from './components/EditableInput';
import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import { PROD_ENVIRONMENT_NAME } from '../../../constants';
import { apiDeleteEnvironment, apiPatchEnvironment, useEnvironment } from '../../../hooks/useEnvironment';
import { useMeta } from '../../../hooks/useMeta';
import { useStore } from '../../../store';
import { SimpleTooltip } from '@/components/SimpleTooltip';
import { AlertDescription } from '@/components/ui/Alert';
import { Alert } from '@/components-v2/ui/alert';
import { Switch } from '@/components-v2/ui/switch';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';

export const General: React.FC = () => {
    const navigate = useNavigate();

    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);
    const { can } = usePermissions();
    const { refetch: refetchMeta } = useMeta();
    const { environmentAndAccount, mutate: mutateEnvironment } = useEnvironment(env);
    const isProduction = environmentAndAccount?.environment.is_production ?? false;
    const isProdEnv = env === PROD_ENVIRONMENT_NAME;
    const canToggleProduction = !isProdEnv && can('environment_production_flag', 'update', 'global');

    const [showDeleteAlert, setShowDeleteAlert] = useState(false);
    const { toast } = useToast();

    const handleToggleProduction = async (checked: boolean) => {
        const { res } = await apiPatchEnvironment(env, { is_production: checked });
        if (res.status >= 200 && res.status < 300) {
            await mutateEnvironment();
            await refetchMeta();
            toast({ title: checked ? 'Environment marked as production' : 'Environment unmarked as production', variant: 'success' });
        } else {
            toast({ title: 'Failed to update production flag', variant: 'error' });
        }
    };

    const handleDelete = async () => {
        const { res } = await apiDeleteEnvironment(env);
        if (res.status >= 200 && res.status < 300) {
            setShowDeleteAlert(false);
            // We have to start by changing the url, otherwise PrivateRoute will revert the env based on it.
            navigate(`/${PROD_ENVIRONMENT_NAME}/environment-settings`);
            await refetchMeta();
            setEnv(PROD_ENVIRONMENT_NAME);
        } else {
            toast({
                title: 'Failed to delete environment',
                variant: 'error'
            });
        }
    };

    return (
        <SettingsContent title="General">
            <SettingsGroup label="Environment name">
                <EditableInput
                    name="environmentName"
                    originalValue={env}
                    apiCall={(name) => apiPatchEnvironment(env, { name })}
                    onSuccess={async (newName) => {
                        // We have to start by changing the url, otherwise PrivateRoute will revert the env based on it.
                        navigate(`/${newName}/environment-settings`);
                        await refetchMeta();
                        setEnv(newName);
                    }}
                    blocked={isProdEnv || (isProduction && !can('environment', 'update', 'production'))}
                    blockedTooltip={
                        isProdEnv ? `You cannot rename the ${PROD_ENVIRONMENT_NAME} environment` : 'You do not have permission to edit this environment'
                    }
                    editInfo={
                        <>
                            <span className="text-text-tertiary text-s -mt-2.5">&#42;Must be lowercase letters, numbers, underscores and/or dashes.</span>
                            {env !== PROD_ENVIRONMENT_NAME && (
                                <Alert variant="info">
                                    <div />
                                    <AlertDescription>
                                        When using the CLI for custom functions, add this to your .env:{' '}
                                        <code className="font-mono text-sm font-semibold">
                                            NANGO_SECRET_KEY_{env.toUpperCase()}={'<secret-key>'}
                                        </code>
                                        .
                                    </AlertDescription>
                                </Alert>
                            )}
                        </>
                    }
                />
            </SettingsGroup>
            <SettingsGroup label="Production environment" className="items-center">
                <div className="flex items-center gap-3">
                    <SimpleTooltip
                        tooltipContent={
                            isProdEnv
                                ? `The ${PROD_ENVIRONMENT_NAME} environment is always a production environment`
                                : !can('environment_production_flag', 'update', 'global')
                                  ? 'You do not have permission to toggle the production flag'
                                  : ''
                        }
                    >
                        <Switch checked={isProduction} onCheckedChange={handleToggleProduction} disabled={!canToggleProduction} />
                    </SimpleTooltip>
                    <span className="text-text-secondary text-body-medium-regular">
                        {isProduction
                            ? 'This environment is marked as production'
                            : 'Mark this environment as production to enable production-level protections'}
                    </span>
                </div>
            </SettingsGroup>
            <SettingsGroup label="Environment suppression" className="items-center">
                <div>
                    <DeleteButton
                        environmentName={env}
                        onDelete={handleDelete}
                        open={showDeleteAlert}
                        onOpenChange={setShowDeleteAlert}
                        disabled={isProdEnv || (isProduction && !can('environment', 'delete', 'production'))}
                        disabledTooltip={
                            isProdEnv
                                ? `You cannot delete the ${PROD_ENVIRONMENT_NAME} environment`
                                : 'You do not have permission to delete production environments'
                        }
                    />
                </div>
            </SettingsGroup>
        </SettingsContent>
    );
};
