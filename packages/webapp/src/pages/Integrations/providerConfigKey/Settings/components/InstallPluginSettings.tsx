import { InfoTooltip } from './InfoTooltip';
import { EditableInput } from '@/components-v2/EditableInput';
import { Label } from '@/components-v2/ui/label';
import { apiPatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';

import type { ApiEnvironment, GetIntegration, PatchIntegration, ProviderInstallPlugin } from '@nangohq/types';

export const InstallPluginSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template }
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();

    const onSave = async (field: Partial<PatchIntegration['Body']>) => {
        const updated = await apiPatchIntegration(env, integration.unique_key, {
            authType: 'INSTALL_PLUGIN',
            ...field
        } as any);
        if ('error' in updated.json) {
            const errorMessage = updated.json.error.message || 'Failed to update, an error occurred';
            toast({ title: errorMessage, variant: 'error' });
            throw new Error(errorMessage);
        } else {
            toast({ title: 'Successfully updated', variant: 'success' });
        }
    };

    const isBasicAuth = template.auth_mode === 'INSTALL_PLUGIN' && (template as ProviderInstallPlugin).auth_type === 'BASIC';

    return (
        <div className="flex flex-col gap-10">
            {/* Install Link */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                    <Label htmlFor="install_link">Install Link</Label>
                    <InfoTooltip>Enter the install link for the plugin</InfoTooltip>
                </div>
                <EditableInput
                    initialValue={integration.app_link || ''}
                    onSave={(value) => onSave({ appLink: value })}
                    placeholder="Enter the install link for the plugin"
                />
            </div>

            {isBasicAuth && (
                <>
                    {/* Username */}
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                            <Label htmlFor="username">Username</Label>
                            <InfoTooltip>Enter the username for basic authentication</InfoTooltip>
                        </div>
                        <EditableInput
                            secret
                            initialValue={integration.custom?.['username'] || ''}
                            onSave={(value) => onSave({ username: value } as any)}
                            placeholder="Enter username"
                        />
                    </div>

                    {/* Password */}
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                            <Label htmlFor="password">Password</Label>
                            <InfoTooltip>Enter the password for basic authentication</InfoTooltip>
                        </div>
                        <EditableInput
                            secret
                            initialValue={integration.custom?.['password'] || ''}
                            onSave={(value) => onSave({ password: value } as any)}
                            placeholder="Enter password"
                        />
                    </div>
                </>
            )}
        </div>
    );
};
