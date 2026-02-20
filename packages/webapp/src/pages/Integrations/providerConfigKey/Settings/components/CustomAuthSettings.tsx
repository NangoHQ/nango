import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

import { AppPrivateKeyInput } from './AppPrivateKeyInput';
import { CopyButton } from '@/components-v2/CopyButton';
import { EditableInput } from '@/components-v2/EditableInput';
import { InfoTooltip } from '@/components-v2/InfoTooltip';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Label } from '@/components-v2/ui/label';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { validateNotEmpty, validateUrl } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { defaultCallback } from '@/utils/utils';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const CustomAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);
    const [isEditingClientId, setIsEditingClientId] = useState(false);

    const callbackUrl = environment.callback_url || defaultCallback();
    const hasExistingClientId = Boolean(integration.oauth_client_id);

    const onSave = async (field: Partial<PatchIntegration['Body']>, supressToast = false) => {
        try {
            await patchIntegration({ authType: 'CUSTOM', ...field } as PatchIntegration['Body']);
            if (!supressToast) {
                toast({ title: 'Successfully updated', variant: 'success' });
            }
        } catch (err) {
            let errorMessage = 'Failed to update, an error occurred';
            if (err instanceof APIError) {
                errorMessage = err.message;
            }
            if (!supressToast) {
                toast({ title: errorMessage, variant: 'error' });
            }
            throw new Error(errorMessage);
        }
    };

    const handleClientIdSave = async (value: string) => {
        // If there is no existing client ID, there's no risk in saving directly
        if (!hasExistingClientId) {
            await onSave({ clientId: value });
            return;
        }

        const confirmed = await confirm({
            icon: <AlertTriangle />,
            title: 'Confirm Client ID update',
            description:
                'Updating the Client ID will invalidate token refreshes for all existing connections for this integration. Are you sure you want to continue?',
            confirmButtonText: 'Update Client ID',
            confirmVariant: 'destructive',
            onConfirm: async () => {
                await onSave({ clientId: value });
            }
        });

        // If user cancelled, throw error to keep EditableInput in edit mode
        if (!confirmed) {
            throw new Error('Cancelled');
        }
    };

    return (
        <div className="flex flex-col gap-10">
            {/* Callback URL */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="callback_url">Callback URL</Label>
                <InputGroup>
                    <InputGroupInput disabled value={callbackUrl} />
                    <InputGroupAddon align="inline-end">
                        <CopyButton text={callbackUrl} />
                    </InputGroupAddon>
                </InputGroup>
            </div>

            {/* App ID */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                    <Label htmlFor="app_id">App ID</Label>
                    <InfoTooltip>Obtain the app id from the app page.</InfoTooltip>
                </div>
                <EditableInput initialValue={integration.custom?.app_id || ''} onSave={(value) => onSave({ appId: value })} validate={validateNotEmpty} />
            </div>

            {/* App Public Link */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                    <Label htmlFor="app_link">App Public Link</Label>
                    <InfoTooltip>Obtain the app public link from the app page.</InfoTooltip>
                </div>
                <EditableInput initialValue={integration.app_link || ''} onSave={(value) => onSave({ appLink: value })} validate={validateUrl} />
            </div>

            {/* Client ID */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="client_id">Client ID</Label>
                <>
                    <EditableInput
                        initialValue={integration.oauth_client_id || ''}
                        onSave={handleClientIdSave}
                        onEditingChange={setIsEditingClientId}
                        validate={validateNotEmpty}
                    />
                    {isEditingClientId && hasExistingClientId && (
                        <Alert variant="warning">
                            <AlertTriangle />
                            <AlertDescription>
                                Updating the Client ID will invalidate token refreshes for all existing connections for this integration.
                            </AlertDescription>
                        </Alert>
                    )}
                </>
            </div>

            {/* Client Secret */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="client_secret">Client Secret</Label>
                <EditableInput
                    secret
                    initialValue={integration.oauth_client_secret || ''}
                    onSave={(value) => onSave({ clientSecret: value })}
                    validate={validateNotEmpty}
                />
            </div>

            {/* App Private Key */}
            <AppPrivateKeyInput initialValue={integration.custom?.private_key || ''} onSave={(value) => onSave({ privateKey: value })} />

            {/* Confirmation Dialog */}
            {DialogComponent}
        </div>
    );
};
