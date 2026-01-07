import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

import { CopyButton } from '@/components-v2/CopyButton';
import { EditableInput } from '@/components-v2/EditableInput';
import { ScopesInput } from '@/components-v2/ScopesInput';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Badge } from '@/components-v2/ui/badge';
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
    const isSharedCredentials = Boolean(integration.shared_credentials_id);

    const onSave = async (field: Partial<PatchIntegration['Body']>, supressToast = false) => {
        const updated = await apiPatchIntegration(env, integration.unique_key, {
            authType: template.auth_mode as Extract<typeof template.auth_mode, 'OAUTH1' | 'OAUTH2' | 'TBA'>,
            ...field
        });
        if ('error' in updated.json) {
            const errorMessage = updated.json.error.message || 'Failed to update, an error occurred';
            if (!supressToast) {
                toast({ title: errorMessage, variant: 'error' });
            }
            throw new Error(errorMessage);
        } else {
            if (!supressToast) {
                toast({ title: 'Successfully updated', variant: 'success' });
            }
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

    const handleScopesChange = async (scopes: string, countDifference: number) => {
        try {
            await onSave({ scopes }, true);

            if (countDifference > 0) {
                const plural = countDifference > 1 ? 'scopes' : 'scope';
                toast({ title: `Added ${countDifference} new ${plural}`, variant: 'success' });
            } else {
                toast({ title: `Scope successfully removed`, variant: 'success' });
            }
        } catch (err) {
            toast({ title: 'Failed to update scopes', variant: 'error' });
            throw err;
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
                {isSharedCredentials ? (
                    <InputGroup>
                        <InputGroupInput disabled value="••••••••••••••••••••••••••••••••" />
                        <InputGroupAddon align="inline-end">
                            <Badge variant="gray">Nango provided</Badge>
                        </InputGroupAddon>
                    </InputGroup>
                ) : (
                    <>
                        <EditableInput initialValue={integration.oauth_client_id || ''} onSave={handleClientIdSave} onEditingChange={setIsEditingClientId} />
                        {isEditingClientId && hasExistingClientId && (
                            <Alert variant="warning">
                                <AlertTriangle />
                                <AlertDescription>
                                    Updating the Client ID will invalidate token refreshes for all existing connections for this integration.
                                </AlertDescription>
                            </Alert>
                        )}
                    </>
                )}
            </div>

            {/* Client Secret */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="client_secret">Client Secret</Label>
                {isSharedCredentials ? (
                    <InputGroup>
                        <InputGroupInput disabled value="••••••••••••••••••••••••••••••••••••••••••••••••" />
                        <InputGroupAddon align="inline-end">
                            <Badge variant="gray">Nango provided</Badge>
                        </InputGroupAddon>
                    </InputGroup>
                ) : (
                    <EditableInput secret initialValue={integration.oauth_client_secret || ''} onSave={(value) => onSave({ clientSecret: value })} />
                )}
            </div>

            {/* Scopes */}
            {template.auth_mode !== 'TBA' && template.installation !== 'outbound' && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="scopes">Scopes</Label>
                    <ScopesInput scopesString={integration.oauth_scopes || ''} onChange={handleScopesChange} isSharedCredentials={isSharedCredentials} />
                </div>
            )}

            {/* Confirmation Dialog */}
            {DialogComponent}
        </div>
    );
};
