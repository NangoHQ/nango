import { useMemo, useState } from 'react';

import { permissions } from '@nangohq/authz';

import { EditableInput } from '@/components-v2/patterns/EditableInput';
import { InfoTooltip } from '@/components-v2/ui/InfoTooltip';
import { Label } from '@/components-v2/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components-v2/ui/Select';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';

import type { ApiEnvironment, GetIntegration, SimplifiedJSONSchema } from '@nangohq/types';

type FieldEntry = [string, SimplifiedJSONSchema];

function buildValidator(definition: SimplifiedJSONSchema): (value: string) => string | null {
    return (value: string) => {
        if (!value) {
            return definition.optional ? null : 'Must not be empty';
        }
        if (definition.format === 'uri') {
            try {
                new URL(value);
            } catch {
                return 'Must be a valid URL';
            }
        }
        if (definition.pattern) {
            try {
                if (!new RegExp(definition.pattern).test(value)) {
                    return `Invalid ${definition.title}`;
                }
            } catch {
                // Ignore an invalid pattern in the provider schema.
            }
        }
        return null;
    };
}

/**
 * Editable custom integration configuration (e.g. private-api-generic), rendered from the provider's
 * `integration_config` and pre-filled from the integration's stored `custom` values. Each field saves
 * independently (text fields via the inline edit/save pattern, enum fields on selection change).
 */
export const CustomIntegrationSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { can } = usePermissions();
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);

    const canEdit = !environment.is_production || can(permissions.canWriteProdIntegrations);

    const fields = useMemo<FieldEntry[]>(
        () => Object.entries(template.integration_config ?? {}).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0)),
        [template.integration_config]
    );

    const saveField = async (name: string, value: string) => {
        try {
            await patchIntegration({ integrationConfig: { [name]: value } });
            toast({ title: 'Successfully updated', variant: 'success' });
        } catch {
            toast({ title: 'Failed to update, an error occurred', variant: 'error' });
            // Rethrow so EditableInput stays in edit mode on failure.
            throw new Error('Failed to update');
        }
    };

    return (
        <div className="flex flex-col gap-10">
            {fields.map(([name, definition]) => (
                <div key={name} className="flex flex-col gap-2">
                    <div className="flex gap-2 items-center">
                        <Label htmlFor={name}>{definition.title}</Label>
                        {definition.description && <InfoTooltip>{definition.description}</InfoTooltip>}
                    </div>
                    {definition.enum && definition.enum.length > 0 ? (
                        <EnumField name={name} definition={definition} initialValue={integration.custom?.[name]} onSave={saveField} canEdit={canEdit} />
                    ) : (
                        <EditableInput
                            id={name}
                            initialValue={integration.custom?.[name] ?? definition.default_value ?? ''}
                            secret={Boolean(definition.secret)}
                            placeholder={definition.example}
                            validate={buildValidator(definition)}
                            onSave={(value) => saveField(name, value)}
                            canEdit={canEdit}
                            canRead={canEdit}
                        />
                    )}
                </div>
            ))}
        </div>
    );
};

const EnumField: React.FC<{
    name: string;
    definition: SimplifiedJSONSchema;
    initialValue: string | undefined;
    onSave: (name: string, value: string) => Promise<void>;
    canEdit: boolean;
}> = ({ name, definition, initialValue, onSave, canEdit }) => {
    const [value, setValue] = useState(initialValue ?? definition.default_value ?? definition.enum?.[0] ?? '');
    const [saving, setSaving] = useState(false);

    const onChange = async (next: string) => {
        const previous = value;
        setValue(next);
        setSaving(true);
        try {
            await onSave(name, next);
        } catch {
            setValue(previous);
        } finally {
            setSaving(false);
        }
    };

    return (
        // Disable while a save is in flight so a rapid second change can't be clobbered by a failed revert.
        <Select value={value} onValueChange={onChange} disabled={!canEdit || saving}>
            <SelectTrigger id={name} className="w-full">
                <SelectValue placeholder={definition.title} />
            </SelectTrigger>
            <SelectContent>
                {definition.enum?.map((option) => (
                    <SelectItem key={option} value={option}>
                        {option}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};
