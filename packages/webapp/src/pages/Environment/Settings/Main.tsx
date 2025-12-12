import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DeleteButton } from './DeleteButton';
import { EditableInput } from './EditableInput';
import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import { PROD_ENVIRONMENT_NAME } from '../../../constants';
import { apiDeleteEnvironment, apiPatchEnvironment } from '../../../hooks/useEnvironment';
import { useMeta } from '../../../hooks/useMeta';
import { useStore } from '../../../store';
import { AlertDescription } from '@/components/ui/Alert';
import { Alert } from '@/components-v2/ui/alert';
import { useToast } from '@/hooks/useToast';

export const MainSettings: React.FC = () => {
    const navigate = useNavigate();

    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);
    const { mutate: mutateMeta } = useMeta();

    const [showDeleteAlert, setShowDeleteAlert] = useState(false);
    const { toast } = useToast();

    const handleDelete = async () => {
        const { res } = await apiDeleteEnvironment(env);
        if (res.status >= 200 && res.status < 300) {
            setShowDeleteAlert(false);
            // We have to start by changing the url, otherwise PrivateRoute will revert the env based on it.
            navigate(`/${PROD_ENVIRONMENT_NAME}/environment-settings`);
            await mutateMeta();
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
                        await mutateMeta();
                        setEnv(newName);
                    }}
                    blocked={env === PROD_ENVIRONMENT_NAME}
                    blockedTooltip={`You cannot rename the ${PROD_ENVIRONMENT_NAME} environment`}
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
            <SettingsGroup label="Environment suppression" className="items-center">
                <div>
                    <DeleteButton
                        environmentName={env}
                        onDelete={handleDelete}
                        open={showDeleteAlert}
                        onOpenChange={setShowDeleteAlert}
                        disabled={env === PROD_ENVIRONMENT_NAME}
                        disabledTooltip={`You cannot delete the ${PROD_ENVIRONMENT_NAME} environment`}
                    />
                </div>
            </SettingsGroup>
        </SettingsContent>
    );
};
