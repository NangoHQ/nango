import { IconKey, IconPencil, IconTrash } from '@tabler/icons-react';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';

import { permissions } from '@nangohq/authz';

import SettingsContent from './components/SettingsContent';
import { useApiKeys, useCreateApiKey, useDeleteApiKey, useUpdateApiKeyScopes } from '../../../hooks/useApiKeys';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { DestructiveActionModal } from '@/components-v2/DestructiveActionModal';
import { PermissionGate } from '@/components-v2/PermissionGate';
import { SecretInput } from '@/components-v2/SecretInput';
import { Badge } from '@/components-v2/ui/badge';
import { Button } from '@/components-v2/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components-v2/ui/dialog';
import { Input } from '@/components-v2/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { usePermissions } from '@/hooks/usePermissions';
import { APIError } from '@/utils/api';

import type { ApiKeyListItem } from '../../../hooks/useApiKeys';

// ── Scope definitions ──────────────────────────────────────────────

const SCOPE_GROUPS: { group: string; scopes: string[] }[] = [
    {
        group: 'Integrations',
        scopes: [
            'environment:integrations:list',
            'environment:integrations:list_credentials',
            'environment:integrations:read',
            'environment:integrations:read_credentials',
            'environment:integrations:write'
        ]
    },
    {
        group: 'Connections',
        scopes: [
            'environment:connections:list',
            'environment:connections:list_credentials',
            'environment:connections:read',
            'environment:connections:read_credentials',
            'environment:connections:write'
        ]
    },
    { group: 'Connect Sessions', scopes: ['environment:connect_sessions:write'] },
    { group: 'Syncs', scopes: ['environment:syncs:read', 'environment:syncs:execute', 'environment:syncs:manage'] },
    { group: 'Deploy', scopes: ['environment:deploy'] },
    { group: 'Records', scopes: ['environment:records:read', 'environment:records:write'] },
    { group: 'Actions', scopes: ['environment:actions:execute'] },
    { group: 'Proxy', scopes: ['environment:proxy'] },
    { group: 'Config', scopes: ['environment:config:read'] },
    { group: 'MCP', scopes: ['environment:mcp'] }
];

const SCOPE_PRESETS: { label: string; description: string; scopes: string[] }[] = [
    { label: 'Full access', description: 'All permissions', scopes: ['environment:*'] },
    { label: 'Auth', description: 'Create connect sessions', scopes: ['environment:connect_sessions:write'] },
    { label: 'CI/CD deploy', description: 'Deploy syncs and actions', scopes: ['environment:deploy'] },
    {
        label: 'Backend service',
        description: 'Read connections, records, execute actions/syncs, proxy',
        scopes: ['environment:connections:read', 'environment:records:read', 'environment:actions:execute', 'environment:syncs:execute', 'environment:proxy']
    }
];

const MAX_VISIBLE_SCOPES = 3;

const ALL_INDIVIDUAL_SCOPES = SCOPE_GROUPS.flatMap((g) => g.scopes);

function expandScopes(scopes: string[]): string[] {
    const expanded = new Set<string>();
    for (const scope of scopes) {
        if (scope === 'environment:*') {
            return ALL_INDIVIDUAL_SCOPES;
        }
        if (scope.endsWith(':*')) {
            const prefix = scope.slice(0, -1);
            for (const s of ALL_INDIVIDUAL_SCOPES) {
                if (s.startsWith(prefix)) {
                    expanded.add(s);
                }
            }
        } else {
            expanded.add(scope);
        }
    }
    return Array.from(expanded);
}

function scopeLabel(scope: string): string {
    const parts = scope.split(':');
    return parts[parts.length - 1];
}

function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${weeks}w ago`;
    return `${months}mo ago`;
}

function formatFullDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Scope selector (used in create dialog) ──────────────────────────

interface ScopeSelectorProps {
    selectedScopes: string[];
    onChange: (scopes: string[]) => void;
}

function groupWildcard(group: { group: string; scopes: string[] }): string {
    // 'environment:integrations:list' -> 'environment:integrations:*'
    const parts = group.scopes[0].split(':');
    return parts.slice(0, -1).join(':') + ':*';
}

function isScopeSelected(scope: string, selectedScopes: string[]): boolean {
    if (selectedScopes.includes(scope)) return true;
    // Check wildcards: environment:* covers everything, environment:integrations:* covers integrations
    return selectedScopes.some((s) => s.endsWith(':*') && scope.startsWith(s.slice(0, -1)));
}

const ScopeSelector: React.FC<ScopeSelectorProps> = ({ selectedScopes, onChange }) => {
    const hasFullAccess = selectedScopes.includes('environment:*');

    const toggleScope = (scope: string) => {
        onChange(selectedScopes.includes(scope) ? selectedScopes.filter((s) => s !== scope) : [...selectedScopes, scope]);
    };

    const isGroupWildcardSelected = (group: { group: string; scopes: string[] }) => selectedScopes.includes(groupWildcard(group));

    const toggleGroup = (group: { group: string; scopes: string[] }) => {
        if (hasFullAccess) return;
        const wc = groupWildcard(group);
        if (selectedScopes.includes(wc)) {
            // Uncheck group: remove wildcard, let user pick individual scopes
            onChange(selectedScopes.filter((s) => s !== wc));
        } else {
            // Check group: store the wildcard, remove any individual scopes from this group
            const cleaned = selectedScopes.filter((s) => !group.scopes.includes(s));
            onChange([...cleaned, wc]);
        }
    };

    const hasAnyChildSelected = (group: { group: string; scopes: string[] }) => group.scopes.some((s) => selectedScopes.includes(s));

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
                <label className="text-body-medium-semi text-text-primary">Quick presets</label>
                <p className="text-body-small-regular text-text-tertiary">Select a preset to pre-fill scopes, then customize below</p>
                <div className="flex flex-wrap gap-2">
                    {SCOPE_PRESETS.map((preset) => (
                        <button
                            key={preset.label}
                            type="button"
                            onClick={() => onChange([...preset.scopes])}
                            title={preset.description}
                            className="px-3 py-1.5 rounded text-body-small-regular border transition-colors cursor-pointer bg-bg-surface text-text-secondary border-border-muted hover:border-border-default"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex flex-col gap-1.5">
                <label className="text-body-medium-semi text-text-primary">Scopes</label>
                <div className="max-h-[280px] overflow-y-auto border border-border-muted rounded p-3 flex flex-col gap-3">
                    {hasFullAccess && (
                        <div className="flex items-center gap-2 pb-2 border-b border-border-muted">
                            <input type="checkbox" checked={true} onChange={() => onChange([])} className="accent-brand" />
                            <span className="text-body-small-semi text-text-primary">Full access</span>
                            <span className="text-body-small-regular text-text-tertiary">— all current and future scopes</span>
                        </div>
                    )}
                    {SCOPE_GROUPS.map((group) => {
                        const groupSelected = isGroupWildcardSelected(group);
                        const childrenDisabled = hasFullAccess || groupSelected;
                        return (
                            <div key={group.group} className="flex flex-col gap-1">
                                <label className={`flex items-center gap-2 ${hasFullAccess ? '' : 'cursor-pointer'}`}>
                                    <input
                                        type="checkbox"
                                        checked={groupSelected || isScopeSelected(group.scopes[0], selectedScopes)}
                                        disabled={hasFullAccess}
                                        ref={(el) => {
                                            if (el) el.indeterminate = !hasFullAccess && !groupSelected && hasAnyChildSelected(group);
                                        }}
                                        onChange={() => toggleGroup(group)}
                                        className="accent-brand"
                                    />
                                    <span className="text-body-small-semi text-text-secondary">{group.group}</span>
                                    {groupSelected && <span className="text-body-small-regular text-text-tertiary">— all</span>}
                                </label>
                                {group.scopes.map((scope) => (
                                    <label key={scope} className={`flex items-center gap-2 pl-5 ${childrenDisabled ? '' : 'cursor-pointer'}`}>
                                        <input
                                            type="checkbox"
                                            checked={isScopeSelected(scope, selectedScopes)}
                                            disabled={childrenDisabled}
                                            onChange={() => toggleScope(scope)}
                                            className="accent-brand"
                                        />
                                        <span className={`text-body-small-regular ${childrenDisabled ? 'text-text-tertiary' : 'text-text-primary'}`}>
                                            {scopeLabel(scope)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        );
                    })}
                </div>
                {selectedScopes.length === 0 && <p className="text-body-small-regular text-text-tertiary">No scopes selected — key will have full access</p>}
            </div>
        </div>
    );
};

// ── Create dialog ───────────────────────────────────────────────────

interface CreateApiKeyDialogProps {
    env: string;
    onCreated: () => void;
    disabled?: boolean;
}

const CreateApiKeyDialog: React.FC<CreateApiKeyDialogProps> = ({ env, onCreated, disabled }) => {
    const [open, setOpen] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
    const { toast } = useToast();
    const { mutateAsync: createApiKey, isPending } = useCreateApiKey(env);

    const handleCreate = async () => {
        if (!displayName.trim()) {
            toast({ title: 'Display name is required', variant: 'error' });
            return;
        }
        try {
            await createApiKey({
                display_name: displayName.trim(),
                scopes: selectedScopes.length > 0 ? selectedScopes : undefined
            });
            setOpen(false);
            setDisplayName('');
            setSelectedScopes([]);
            toast({ title: 'API key created', variant: 'success' });
            onCreated();
        } catch (err) {
            if (err instanceof APIError) {
                toast({ title: (err.json as any)?.error?.message ?? 'Failed to create API key', variant: 'error' });
            } else {
                toast({ title: 'Failed to create API key', variant: 'error' });
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="secondary" disabled={disabled}>
                    <IconKey stroke={1} size={18} />
                    Create API Key
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create API Key</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="api-key-name" className="text-body-medium-semi text-text-primary">
                            Display name
                        </label>
                        <Input id="api-key-name" placeholder="e.g. Production backend" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                    </div>
                    <ScopeSelector selectedScopes={selectedScopes} onChange={setSelectedScopes} />
                </div>
                <DialogFooter>
                    <Button variant="tertiary" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreate} loading={isPending}>
                        Create API Key
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// ── Key detail view ─────────────────────────────────────────────────

interface KeyDetailProps {
    apiKey: ApiKeyListItem;
    env: string;
    onBack: () => void;
    onDelete: (keyId: number) => void;
    canReadSecret: boolean;
    canManageKeys: boolean;
}

const KeyDetail: React.FC<KeyDetailProps> = ({ apiKey, env, onBack, onDelete, canReadSecret, canManageKeys }) => {
    const [editedScopes, setEditedScopes] = useState<string[]>(apiKey.scopes);
    const { mutateAsync: updateScopes, isPending } = useUpdateApiKeyScopes(env);
    const { toast } = useToast();

    const hasChanges = JSON.stringify(editedScopes.slice().sort()) !== JSON.stringify(apiKey.scopes.slice().sort());

    const handleSave = async () => {
        try {
            await updateScopes({ keyId: apiKey.id, scopes: editedScopes.length > 0 ? editedScopes : ['environment:*'] });
            toast({ title: 'Scopes updated', variant: 'success' });
        } catch (err) {
            if (err instanceof APIError) {
                toast({ title: (err.json as any)?.error?.message ?? 'Failed to update scopes', variant: 'error' });
            } else {
                toast({ title: 'Failed to update scopes', variant: 'error' });
            }
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ChevronLeft size={16} />
                    Back
                </Button>
                <h3 className="text-body-medium-semi text-text-primary">{apiKey.display_name}</h3>
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex gap-6">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-body-small-semi text-text-secondary">Created</span>
                        <span className="text-body-small-regular text-text-primary">{formatDate(apiKey.created_at)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-body-small-semi text-text-secondary">Last used</span>
                        <span className="text-body-small-regular text-text-primary" title={formatFullDate(apiKey.last_used_at)}>
                            {formatRelativeTime(apiKey.last_used_at)}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-body-small-semi text-text-secondary">Secret</label>
                    {canReadSecret ? (
                        <SecretInput value={apiKey.secret} copy canRead readOnly />
                    ) : (
                        <span className="font-mono text-body-small-regular text-text-secondary">{apiKey.secret}</span>
                    )}
                </div>

                {canManageKeys ? (
                    <ScopeSelector selectedScopes={editedScopes} onChange={setEditedScopes} />
                ) : (
                    <div className="flex flex-col gap-1.5">
                        <label className="text-body-small-semi text-text-secondary">Scopes</label>
                        <div className="border border-border-muted rounded p-3 flex flex-wrap gap-1 opacity-60">
                            {expandScopes(apiKey.scopes).map((scope) => (
                                <Badge key={scope} variant="secondary">
                                    {scope}
                                </Badge>
                            ))}
                        </div>
                        <p className="text-body-small-regular text-text-tertiary">You do not have permission to edit scopes on this environment.</p>
                    </div>
                )}

                <div className="flex justify-between pt-2 border-t border-border-muted">
                    {canManageKeys ? <DeleteApiKeyButton displayName={apiKey.display_name} onDelete={() => onDelete(apiKey.id)} /> : <div />}
                    {hasChanges && canManageKeys && (
                        <Button size="sm" onClick={handleSave} loading={isPending}>
                            Save changes
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Delete button with name confirmation ────────────────────────────

const DeleteApiKeyButton: React.FC<{ displayName: string; onDelete: () => void; iconOnly?: boolean }> = ({ displayName, onDelete, iconOnly }) => {
    const [open, setOpen] = useState(false);

    const trigger = iconOnly ? (
        <Button variant="ghost" size="icon" className="text-text-tertiary hover:text-feedback-error-fg">
            <IconTrash stroke={1} size={16} />
        </Button>
    ) : (
        <Button variant="destructive" size="sm">
            <IconTrash stroke={1} size={16} />
            Delete key
        </Button>
    );

    return (
        <DestructiveActionModal
            title="Delete API Key"
            description={`This action is irreversible. Any services using the key "${displayName}" will lose access immediately.`}
            inputLabel={`To confirm, type the key name (${displayName}) below:`}
            confirmationKeyword={displayName}
            confirmButtonText="Delete API Key"
            trigger={trigger}
            onConfirm={onDelete}
            open={open}
            onOpenChange={setOpen}
        />
    );
};

// ── Main component ──────────────────────────────────────────────────

export const ApiKeys: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data, isLoading } = useApiKeys(env);
    const { data: envData } = useEnvironment(env);
    const { mutateAsync: deleteApiKey } = useDeleteApiKey(env);
    const { toast } = useToast();
    const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);

    const { can } = usePermissions();
    const isProd = envData?.environmentAndAccount?.environment?.is_production || false;
    const canReadSecret = can(permissions.canReadProdSecretKey) || !isProd;
    const canManageKeys = can(permissions.canWriteProdEnvironmentKeys) || !isProd;

    const apiKeys = data?.data ?? [];
    const selectedKey = selectedKeyId !== null ? apiKeys.find((k) => k.id === selectedKeyId) : null;

    const handleDelete = async (keyId: number) => {
        try {
            await deleteApiKey(keyId);
            setSelectedKeyId(null);
            toast({ title: 'API key deleted', variant: 'success' });
        } catch (err) {
            if (err instanceof APIError) {
                toast({ title: (err.json as any)?.error?.message ?? 'Failed to delete API key', variant: 'error' });
            } else {
                toast({ title: 'Failed to delete API key', variant: 'error' });
            }
        }
    };

    if (selectedKey) {
        return (
            <SettingsContent title="API Keys">
                <KeyDetail
                    apiKey={selectedKey}
                    env={env}
                    onBack={() => setSelectedKeyId(null)}
                    onDelete={(keyId) => void handleDelete(keyId)}
                    canReadSecret={canReadSecret}
                    canManageKeys={canManageKeys}
                />
            </SettingsContent>
        );
    }

    return (
        <SettingsContent title="API Keys">
            <div className="flex items-center justify-between">
                <p className="text-body-small-regular text-text-secondary">API keys allow programmatic access to this Nango environment.</p>
                <PermissionGate condition={canManageKeys}>
                    {(allowed) => <CreateApiKeyDialog env={env} onCreated={() => void 0} disabled={!allowed} />}
                </PermissionGate>
            </div>

            {isLoading ? (
                <div className="text-body-small-regular text-text-tertiary py-4">Loading API keys...</div>
            ) : apiKeys.length === 0 ? (
                <div className="text-body-small-regular text-text-tertiary py-4">No API keys yet. Create one to get started.</div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Scopes</TableHead>
                            <TableHead>Last used</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {apiKeys.map((key) => (
                            <TableRow key={key.id}>
                                <TableCell>
                                    <span className="text-body-small-semi text-text-primary">{key.display_name}</span>
                                </TableCell>
                                <TableCell>
                                    {(() => {
                                        const expanded = expandScopes(key.scopes);
                                        return (
                                            <div className="flex flex-wrap gap-1">
                                                {expanded.slice(0, MAX_VISIBLE_SCOPES).map((scope) => (
                                                    <Badge key={scope} variant="secondary">
                                                        {scope}
                                                    </Badge>
                                                ))}
                                                {expanded.length > MAX_VISIBLE_SCOPES && (
                                                    <Badge variant="gray">+{expanded.length - MAX_VISIBLE_SCOPES} more</Badge>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </TableCell>
                                <TableCell>
                                    <span className="text-text-secondary" title={formatFullDate(key.last_used_at)}>
                                        {formatRelativeTime(key.last_used_at)}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <span className="text-text-secondary">{formatDate(key.created_at)}</span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setSelectedKeyId(key.id)}
                                            className="text-text-tertiary hover:text-text-primary"
                                        >
                                            <IconPencil stroke={1} size={16} />
                                        </Button>
                                        {canManageKeys && (
                                            <DeleteApiKeyButton displayName={key.display_name} onDelete={() => void handleDelete(key.id)} iconOnly />
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </SettingsContent>
    );
};
