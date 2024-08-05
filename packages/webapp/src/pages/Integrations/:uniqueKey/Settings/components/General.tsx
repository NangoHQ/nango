import { useState } from 'react';
import type { GetIntegration } from '@nangohq/types';
import { Pencil1Icon } from '@radix-ui/react-icons';
import { formatDateToUSFormat } from '../../../../../utils/utils';
import Button from '../../../../../components/ui/button/Button';
import { Input } from '../../../../../components/ui/input/Input';
import { apiPatchIntegration } from '../../../../../hooks/useIntegration';
import { useToast } from '../../../../../hooks/useToast';
import { useStore } from '../../../../../store';
import { useNavigate } from 'react-router-dom';
import { mutate } from 'swr';
import { InfoBloc } from '../../../../../components/InfoBloc';

export const SettingsGeneral: React.FC<{ data: GetIntegration['Success']['data'] }> = ({ data: { integration, template } }) => {
    const { toast } = useToast();
    const navigate = useNavigate();

    const env = useStore((state) => state.env);
    const [showEditIntegrationId, setShowEditIntegrationId] = useState(false);
    const [integrationId, setIntegrationId] = useState(integration.unique_key);
    const [loading, setLoading] = useState(false);

    const onSaveIntegrationID = async () => {
        setLoading(true);

        const updated = await apiPatchIntegration(env, integration.unique_key, { integrationId });

        setLoading(false);
        if ('error' in updated.json) {
            toast({ title: updated.json.error.message || 'Failed to update, an error occurred', variant: 'error' });
        } else {
            toast({ title: 'Successfully updated integration id', variant: 'success' });
            setShowEditIntegrationId(false);
            void mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/integration`), undefined);
            navigate(`/${env}/integrations/${integrationId}`);
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <div className="flex gap-10">
                <InfoBloc title="API Provider">{integration?.provider}</InfoBloc>
                <InfoBloc title="Integration ID">
                    {showEditIntegrationId ? (
                        <div className="flex flex-col gap-5 grow">
                            <Input
                                value={integrationId}
                                variant={'flat'}
                                onChange={(e) => {
                                    setIntegrationId(e.target.value);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        void onSaveIntegrationID();
                                    }
                                }}
                            />
                            <div className="flex justify-end gap-2 items-center">
                                <Button
                                    size={'xs'}
                                    variant={'emptyFaded'}
                                    onClick={() => {
                                        setIntegrationId(integration.unique_key);
                                        setShowEditIntegrationId(false);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button size={'xs'} variant={'primary'} onClick={() => onSaveIntegrationID()} isLoading={loading}>
                                    Save
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center text-white text-sm">
                            <div className="mr-2">{integration.unique_key}</div>
                            <Button variant={'icon'} onClick={() => setShowEditIntegrationId(true)} size={'xs'}>
                                <Pencil1Icon />
                            </Button>
                        </div>
                    )}
                </InfoBloc>
            </div>
            <div className="flex gap-10">
                <InfoBloc title="Creation Date">{formatDateToUSFormat(integration.created_at)}</InfoBloc>
                <InfoBloc title="Auth Type">{template.auth_mode}</InfoBloc>
            </div>
        </div>
    );
};
