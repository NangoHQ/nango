import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { permissions } from '@nangohq/authz';
import { Button } from '@nangohq/design-system';

import { KeyValueInput } from '@/components/patterns/KeyValueInput';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { KeyValueBadge } from '@/components/ui/KeyValueBadge';
import { usePatchConnection } from '@/hooks/useConnections';
import { useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';

import type { Tags } from '@nangohq/types';

export const EditableConnectionTags = ({ connectionId, providerConfigKey, tags }: { connectionId: string; providerConfigKey: string; tags: Tags }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { data } = useEnvironment(env);
    const environment = data?.environmentAndAccount?.environment;
    const { can } = usePermissions();
    const canEditConnection = can(permissions.canWriteProdConnections) || !environment?.is_production;

    const { mutateAsync: patchConnectionTags, isPending } = usePatchConnection();

    const [edit, setEdit] = useState(false);
    const [localTags, setLocalTags] = useState<Tags>(tags);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!edit) {
            setLocalTags(tags);
        }
    }, [tags, edit]);

    const onSave = async () => {
        setError(null);
        try {
            await patchConnectionTags({
                params: { connectionId },
                query: { env, provider_config_key: providerConfigKey },
                body: { tags: localTags }
            });
            setEdit(false);
            toast({ title: 'Tags updated', variant: 'success' });
        } catch (err) {
            if (err instanceof APIError && err.json.error.code === 'invalid_body') {
                setError(err.json.error.message ?? 'Invalid tags');
            } else {
                toast({ title: 'Failed to update tags', variant: 'error' });
            }
        }
    };

    const onCancel = () => {
        setLocalTags(tags);
        setError(null);
        setEdit(false);
    };

    const onEdit = () => {
        setLocalTags(tags);
        setEdit(true);
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="inline-flex gap-1 items-center">
                <span className="text-body-medium-medium text-text-strong">Tags</span>
                <Link to="https://nango.dev/docs/guides/auth/connection-tags" target="_blank" aria-label="Learn about connection tags">
                    <ExternalLink className="size-3 text-icon-muted" />
                </Link>
            </div>

            {!edit ? (
                <>
                    {Object.keys(tags).length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(tags).map(([key, value]) => (
                                <KeyValueBadge label={key} key={key} variant="lighter">
                                    {value}
                                </KeyValueBadge>
                            ))}
                        </div>
                    ) : (
                        <span className="text-body-small-regular text-text-tertiary">No tags</span>
                    )}
                    <div className="flex justify-start">
                        <PermissionGate asChild condition={canEditConnection}>
                            {(allowed) => (
                                <Button variant="outline" onClick={onEdit} disabled={!allowed}>
                                    Edit
                                </Button>
                            )}
                        </PermissionGate>
                    </div>
                </>
            ) : (
                <div className="flex flex-col gap-3">
                    <KeyValueInput
                        initialValues={localTags}
                        onChange={setLocalTags}
                        placeholderKey="Tag Name"
                        placeholderValue="Tag Value"
                        disabled={isPending}
                    />
                    {error && <p className="text-body-small-regular text-feedback-error-fg">{error}</p>}
                    <div className="flex justify-start gap-2">
                        <Button variant="outline" onClick={onCancel} disabled={isPending}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={onSave} loading={isPending}>
                            Save
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
