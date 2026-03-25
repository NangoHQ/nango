import { Info } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DeleteButton } from './components/DeleteButton';
import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import { PROD_ENVIRONMENT_NAME } from '../../../constants';
import { useDeleteEnvironment, usePatchEnvironment } from '../../../hooks/useEnvironment';
import { useMeta } from '../../../hooks/useMeta';
import { useStore } from '../../../store';
import { EditableInput } from '@/components-v2/EditableInput';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { useToast } from '@/hooks/useToast';
import { APIError } from '@/utils/api';

export const General: React.FC = () => {
    const navigate = useNavigate();

    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);
    const { toast } = useToast();

    const { refetch: refetchMeta } = useMeta();
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);
    const { mutateAsync: deleteEnvironmentAsync } = useDeleteEnvironment(env);

    const [showDeleteAlert, setShowDeleteAlert] = useState(false);

    const handleDelete = async () => {
        try {
            await deleteEnvironmentAsync();
            setShowDeleteAlert(false);
            navigate(`/${PROD_ENVIRONMENT_NAME}/environment-settings`);
            await refetchMeta();
            setEnv(PROD_ENVIRONMENT_NAME);
        } catch {
            toast({
                title: 'Failed to delete environment',
                variant: 'error'
            });
        }
    };

    return (
        <SettingsContent title="General">
            <SettingsGroup label="Environment name">
                <div className="flex flex-col gap-2">
                    <EditableInput
                        initialValue={env}
                        onSave={async (name) => {
                            try {
                                await patchEnvironmentAsync({ name });
                                navigate(`/${name}/environment-settings`);
                                await refetchMeta();
                                setEnv(name);
                                toast({ title: 'Successfully updated', variant: 'success' });
                            } catch (err: unknown) {
                                if (err instanceof APIError) {
                                    toast({ title: err.json.error?.message ?? 'Failed to update', variant: 'error' });
                                } else {
                                    toast({ title: 'Failed to update', variant: 'error' });
                                }
                                // Throw for EditableInput
                                throw err;
                            }
                        }}
                        disabled={env === PROD_ENVIRONMENT_NAME ? `You cannot rename the ${PROD_ENVIRONMENT_NAME} environment` : false}
                        hintText="Must be lowercase letters, numbers, underscores and/or dashes."
                    />

                    {env !== PROD_ENVIRONMENT_NAME && (
                        <Alert variant="info">
                            <Info />
                            <AlertDescription>
                                <span>
                                    When using the CLI for custom functions, add this to your .env:{' '}
                                    <code className="font-mono text-sm font-semibold">
                                        NANGO_SECRET_KEY_{env.toUpperCase()}={'<secret-key>'}
                                    </code>
                                    .
                                </span>
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            </SettingsGroup>
            <SettingsGroup label="Environment suppression" className="items-center">
                <div>
                    <DeleteButton
                        environmentName={env}
                        onDelete={handleDelete}
                        open={showDeleteAlert}
                        onOpenChange={setShowDeleteAlert}
                        disabled={env === PROD_ENVIRONMENT_NAME ? `You cannot delete the ${PROD_ENVIRONMENT_NAME} environment` : false}
                    />
                </div>
            </SettingsGroup>
        </SettingsContent>
    );
};
