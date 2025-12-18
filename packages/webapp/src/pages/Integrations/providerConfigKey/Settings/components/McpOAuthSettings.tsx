import { CopyButton } from '@/components-v2/CopyButton';
import { EditableInput } from '@/components-v2/EditableInput';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Label } from '@/components-v2/ui/label';
import { apiPatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { defaultCallback } from '@/utils/utils';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const McpOAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();

    const callbackUrl = environment.callback_url || defaultCallback();

    const onSave = async (field: Partial<PatchIntegration['Body']>) => {
        const updated = await apiPatchIntegration(env, integration.unique_key, {
            authType: template.auth_mode as Extract<typeof template.auth_mode, 'MCP_OAUTH2'>,
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
                <InputGroup>
                    <InputGroupInput
                        disabled
                        readOnly
                        value={integration.oauth_client_id || ''}
                        placeholder="Find the Client ID on the developer portal of the external API provider."
                    />
                </InputGroup>
            </div>

            {/* Scopes */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="scopes">Scopes</Label>
                <EditableInput initialValue={integration.oauth_scopes || ''} onSave={(value) => onSave({ scopes: value })} />
            </div>
        </div>
    );
};
