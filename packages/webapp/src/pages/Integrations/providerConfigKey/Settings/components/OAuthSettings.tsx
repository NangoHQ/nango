import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

import { CopyButton } from '@/components-v2/CopyButton';
import { EditableInput } from '@/components-v2/EditableInput';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Label } from '@/components-v2/ui/label';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { apiPatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { defaultCallback } from '@/utils/utils';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const OAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();
    const [isEditingClientId, setIsEditingClientId] = useState(false);

    const callbackUrl = environment.callback_url || defaultCallback();
    const hasExistingClientId = Boolean(integration.oauth_client_id);

    const onSave = async (field: Partial<PatchIntegration['Body']>) => {
        const updated = await apiPatchIntegration(env, integration.unique_key, {
            authType: template.auth_mode as Extract<typeof template.auth_mode, 'OAUTH1' | 'OAUTH2' | 'TBA'>,
            ...field
        });
        if ('error' in updated.json) {
            const errorMessage = updated.json.error.message || 'Failed to update, an error occurred';
            toast({ title: errorMessage, variant: 'error' });
            throw new Error(errorMessage);
        } else {
            toast({ title: 'Successfully updated', variant: 'success' });
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

            {/* Client ID */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="client_id">Client ID</Label>
                <EditableInput initialValue={integration.oauth_client_id || ''} onSave={handleClientIdSave} onEditingChange={setIsEditingClientId} />
                {isEditingClientId && hasExistingClientId && (
                    <Alert variant="warning">
                        <AlertTriangle />
                        <AlertDescription>
                            Updating the Client ID will invalidate token refreshes for all existing connections for this integration.
                        </AlertDescription>
                    </Alert>
                )}
            </div>

            {/* Client Secret */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="client_secret">Client Secret</Label>
                <EditableInput secret initialValue={integration.oauth_client_secret || ''} onSave={(value) => onSave({ clientSecret: value })} />
            </div>

            {/* Scopes */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="scopes">Scopes</Label>
                <EditableInput initialValue={integration.oauth_scopes || ''} onSave={(value) => onSave({ scopes: value })} />
            </div>

            {/* Confirmation Dialog */}
            {DialogComponent}
        </div>
    );
};
