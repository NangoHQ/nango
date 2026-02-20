import { EditableInput } from '@/components-v2/EditableInput';
import { Label } from '@/components-v2/ui/label';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { validateNotEmpty, validateUrl } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';

import type { ApiEnvironment, GetIntegration, PatchIntegration, ProviderInstallPlugin } from '@nangohq/types';

export const InstallPluginSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template }
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);

    const onSave = async (field: Partial<PatchIntegration['Body']>) => {
        try {
            await patchIntegration({ authType: 'INSTALL_PLUGIN', ...field } as PatchIntegration['Body']);
            toast({ title: 'Successfully updated', variant: 'success' });
        } catch (err) {
            let errorMessage = 'Failed to update, an error occurred';
            if (err instanceof APIError) {
                errorMessage = err.message;
            }
            toast({ title: errorMessage, variant: 'error' });
            throw new Error(errorMessage);
        }
    };

    const isBasicAuth = template.auth_mode === 'INSTALL_PLUGIN' && (template as ProviderInstallPlugin).auth_type === 'BASIC';

    return (
        <div className="flex flex-col gap-10">
            {/* Install Link */}
            <div className="flex flex-col gap-2">
                <Label htmlFor="install_link">Install Link</Label>
                <EditableInput initialValue={integration.app_link || ''} onSave={(value) => onSave({ appLink: value })} validate={validateUrl} />
            </div>

            {isBasicAuth && (
                <>
                    {/* Username */}
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="username">Username</Label>
                        <EditableInput
                            secret
                            initialValue={integration.custom?.['username'] || ''}
                            onSave={(value) => onSave({ username: value } as any)}
                            validate={validateNotEmpty}
                        />
                    </div>

                    {/* Password */}
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="password">Password</Label>
                        <EditableInput
                            secret
                            initialValue={integration.custom?.['password'] || ''}
                            onSave={(value) => onSave({ password: value } as any)}
                            validate={validateNotEmpty}
                        />
                    </div>
                </>
            )}
        </div>
    );
};
