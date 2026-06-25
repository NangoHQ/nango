import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { permissions } from '@nangohq/authz';
import { Label } from '@nangohq/design-system';

import { EditableInput } from '@/components/patterns/EditableInput';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { isIntegrationConfigFieldVisible } from '@/utils/integrationConfig';

import type { ApiEnvironment, GetIntegration, SimplifiedJSONSchema } from '@nangohq/types';

type FieldEntry = [string, SimplifiedJSONSchema];

function buildValidator(definition: SimplifiedJSONSchema): (value: string) => string | null {
    return (value: string) => {
        if (!value) {
            return definition.optional ? null : 'Must not be empty';
        }
        if (definition.format === 'uri') {
            let protocol: string | undefined;
            try {
                protocol = new URL(value).protocol;
            } catch {
                return 'Must be a valid URL';
            }
            if (protocol !== 'http:' && protocol !== 'https:') {
                return 'Must be an http(s) URL';
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

    const schemaMap = template.integration_config ?? {};

    const fields = useMemo<FieldEntry[]>(
        () => Object.entries(template.integration_config ?? {}).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0)),
        [template.integration_config]
    );

    // Only show fields that apply to the current configuration. Each field saves independently, so
    // visibility is evaluated against the already-stored values; changing a discriminator (e.g. stsMode)
    // saves it, then its dependent fields appear on refetch.
    const visibleFields = fields.filter(([name]) => isIntegrationConfigFieldVisible(name, schemaMap, integration.custom ?? {}));

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

    // Secrets come back masked ("***"); the editable starts blank and an unchanged/blank secret is not
    // re-submitted, so the stored value is preserved (the resolver keeps omitted fields in patch mode).
    const secretInitialValue = (definition: SimplifiedJSONSchema, stored: string | undefined) => {
        if (definition.secret && stored === '***') {
            return '';
        }
        return stored ?? definition.default_value ?? '';
    };

    const onFieldSave = (definition: SimplifiedJSONSchema, name: string) => (value: string) => {
        if (definition.secret && (value === '' || value === '***')) {
            // Unchanged secret — leave the stored value as-is.
            return Promise.resolve();
        }
        return saveField(name, value);
    };

    return (
        <div className="flex flex-col gap-10">
            {visibleFields.map(([name, definition]) => (
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
                            initialValue={secretInitialValue(definition, integration.custom?.[name])}
                            secret={Boolean(definition.secret)}
                            placeholder={definition.secret && integration.custom?.[name] === '***' ? '•••••• (set — leave blank to keep)' : definition.example}
                            validate={buildValidator(definition)}
                            onSave={onFieldSave(definition, name)}
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

    const warning = definition.warnings?.[value];

    return (
        <div className="flex flex-col gap-2">
            {/* Disable while a save is in flight so a rapid second change can't be clobbered by a failed revert. */}
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
            {warning && (
                <Alert variant="warning">
                    <AlertTriangle />
                    <AlertDescription>{warning}</AlertDescription>
                </Alert>
            )}
        </div>
    );
};
