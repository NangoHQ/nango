import { CircleX, ExternalLink, KeyRound, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Helmet } from 'react-helmet';

import {
    Alert,
    AlertActions,
    AlertButton,
    AlertDescription,
    AlertTitle,
    Button,
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    Field,
    FieldLabel,
    IconButton,
    Input
} from '@nangohq/design-system';

import { DestructiveActionModal } from '@/components/patterns/DestructiveActionModal';
import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { CopyButton } from '@/components/ui/CopyButton';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useAccountApiKeys, useCreateAccountApiKey, useDeleteAccountApiKey } from '@/hooks/useAccountApiKeys';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useUser } from '@/hooks/useUser';
import DashboardLayout from '@/layout/DashboardLayout';
import { track } from '@/utils/analytics';
import { APIError } from '@/utils/api';

import type { AccountApiKey } from '@nangohq/types';

function apiErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof APIError)) {
        return fallback;
    }
    const json = error.json as { error?: { message?: string } };
    return json.error?.message ?? fallback;
}

function formatDate(value: string | null): string {
    if (!value) {
        return 'Never';
    }
    return new Date(value).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

const CreateAccountApiKeyDialog: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const inputId = useId();
    const formId = useId();
    const { mutateAsync: createAccountApiKey, isPending } = useCreateAccountApiKey();
    const { toast } = useToast();

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) {
            setDisplayName('');
        }
    };

    const handleCreate = async () => {
        const name = displayName.trim();
        if (!name) {
            return;
        }

        try {
            await createAccountApiKey({ display_name: name });
            track('web:account_api_keys:created', {});
            handleOpenChange(false);
            toast({ title: 'Account API key created', variant: 'success' });
        } catch (err) {
            toast({ title: apiErrorMessage(err, 'Failed to create an Account API key'), variant: 'error' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="primary">
                    <KeyRound size={16} strokeWidth={1} />
                    Create Account API key
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create Account API key</DialogTitle>
                    <DialogDescription>
                        This Account API key will have full access to account-level APIs. It will not grant access to environments.
                    </DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <form
                        id={formId}
                        onSubmit={(event) => {
                            event.preventDefault();
                            void handleCreate();
                        }}
                    >
                        <Field>
                            <FieldLabel htmlFor={inputId}>Display name</FieldLabel>
                            <Input
                                id={inputId}
                                name="display_name"
                                value={displayName}
                                onChange={(event) => setDisplayName(event.target.value)}
                                placeholder="e.g. Billing automation"
                                autoComplete="off"
                                autoFocus
                            />
                        </Field>
                    </form>
                </DialogBody>
                <DialogFooter>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form={formId} size="sm" loading={isPending} disabled={!displayName.trim()}>
                        Create Account API key
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const DeleteAccountApiKeyButton: React.FC<{
    apiKey: AccountApiKey;
    disabled: boolean;
    onDelete: (apiKey: AccountApiKey) => Promise<void>;
}> = ({ apiKey, disabled, onDelete }) => {
    const [open, setOpen] = useState(false);

    return (
        <DestructiveActionModal
            title="Delete Account API key"
            description={
                <>
                    This action is irreversible. Any services using <strong className="text-text-strong">{apiKey.display_name}</strong> will lose account access
                    immediately.
                </>
            }
            inputLabel="To confirm, type the Account API key name below:"
            confirmationKeyword={apiKey.display_name}
            confirmButtonText="Delete Account API key"
            trigger={
                <IconButton label={`Delete Account API key ${apiKey.display_name}`} variant="ghost" size="2xs" disabled={disabled}>
                    <Trash2 size={14} />
                </IconButton>
            }
            onConfirm={() => {
                void onDelete(apiKey)
                    .then(() => setOpen(false))
                    // Error already toasted in handleDelete; swallowed so the modal stays open without an unhandled rejection.
                    .catch(() => undefined);
            }}
            open={open}
            onOpenChange={setOpen}
        />
    );
};

export const AccountApiKeysShow: React.FC = () => {
    const { user } = useUser();
    const { can } = usePermissions();
    const canListAccountKeys = can('account:api_keys:list');
    const canDeleteAccountKeys = can('account:api_keys:delete');
    const { data, isLoading, isError, refetch } = useAccountApiKeys(Boolean(user) && canListAccountKeys);
    const { mutateAsync: deleteAccountApiKey, isPending: isDeleting } = useDeleteAccountApiKey();
    const { toast } = useToast();

    const handleDelete = async (apiKey: AccountApiKey) => {
        try {
            await deleteAccountApiKey(apiKey.id);
            track('web:account_api_keys:deleted', {});
            toast({ title: 'Account API key deleted', variant: 'success' });
        } catch (err) {
            toast({ title: apiErrorMessage(err, 'Failed to delete the Account API key'), variant: 'error' });
            throw err;
        }
    };

    if (!user) {
        return (
            <DashboardLayout fullWidth title="Account API keys">
                <Helmet>
                    <title>Account API keys - Nango</title>
                </Helmet>
                <div className="mx-auto flex max-w-377 flex-col gap-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-10 w-40 self-end" />
                    <Skeleton className="h-48 w-full" />
                </div>
            </DashboardLayout>
        );
    }

    if (!canListAccountKeys) {
        return (
            <DashboardLayout fullWidth title="Account API keys">
                <Helmet>
                    <title>Account API keys - Nango</title>
                </Helmet>
                <div className="flex flex-col items-center gap-2 rounded-md border border-border-muted p-10 py-20 text-center text-text-strong">
                    <h2 className="text-xl">Access denied</h2>
                    <p className="text-sm text-text-muted">Only account administrators can manage Account API keys.</p>
                </div>
            </DashboardLayout>
        );
    }

    const apiKeys = data?.data ?? [];

    return (
        <DashboardLayout fullWidth title="Account API keys">
            <Helmet>
                <title>Account API keys - Nango</title>
            </Helmet>

            <div className="mx-auto flex max-w-377 flex-col gap-4">
                <Alert variant="neutral" role="note">
                    <KeyRound />
                    <AlertTitle>Account-level access</AlertTitle>
                    <AlertDescription>
                        <span className="min-w-0">
                            Account API keys can access account-level APIs but cannot access environments. For environment-level access, create an API key in
                            Environment settings.
                        </span>
                    </AlertDescription>
                    <AlertActions>
                        <AlertButtonLink to="https://nango.dev/docs/reference/backend/http-api/api-keys" target="_blank" rel="noopener noreferrer">
                            Learn more
                            <ExternalLink />
                        </AlertButtonLink>
                    </AlertActions>
                </Alert>

                <div className="flex justify-end">
                    <CreateAccountApiKeyDialog />
                </div>

                {isLoading ? (
                    <Skeleton className="h-48 w-full" />
                ) : isError ? (
                    <Alert variant="danger">
                        <CircleX />
                        <AlertTitle>Failed to load Account API keys</AlertTitle>
                        <AlertDescription>Something went wrong while loading your Account API keys.</AlertDescription>
                        <AlertActions>
                            <AlertButton onClick={() => void refetch()}>Try again</AlertButton>
                        </AlertActions>
                    </Alert>
                ) : apiKeys.length === 0 ? (
                    <EmptyCard>
                        <span className="text-text-strong text-title-body">No Account API keys</span>
                        <span className="text-text-secondary text-body-medium-regular">Create an Account API key for account-level automation.</span>
                    </EmptyCard>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Access</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Last used</TableHead>
                                <TableHead>Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {apiKeys.map((apiKey) => (
                                <TableRow key={apiKey.id}>
                                    <TableCell>
                                        <span className="text-body-small-semi text-text-strong">{apiKey.display_name}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-body-small-regular text-text-secondary">Account-level APIs</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-text-secondary">{formatDate(apiKey.created_at)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-text-secondary">{formatDate(apiKey.last_used_at)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            <CopyButton text={apiKey.secret} onCopy={() => track('web:account_api_keys:secret_copied', {})} />
                                            <DeleteAccountApiKeyButton apiKey={apiKey} disabled={isDeleting || !canDeleteAccountKeys} onDelete={handleDelete} />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>
        </DashboardLayout>
    );
};
