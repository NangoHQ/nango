import { Ellipsis, ExternalLink, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import { permissions } from '@nangohq/authz';
import { Button, IconButton, Input } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Dot } from '@/components/ui/Dot';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { StatusWithIcon } from '@/components/ui/StatusWithIcon';
import { StyledLink } from '@/components/ui/StyledLink';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useDeleteInvite } from '@/hooks/useInvite';
import { usePermissions } from '@/hooks/usePermissions';
import { planHasRbac, useApiGetCurrentPlan } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useUser } from '@/hooks/useUser';
import { useDeleteTeamUser, usePatchTeamUser, useTeam } from '../../../hooks/useTeam';
import { useStore } from '../../../store';
import { RoleSelect } from './RoleSelect';

import type { ApiInvitation, ApiUser, Role } from '@nangohq/types';

const EditRoleDialog: React.FC<{ user: ApiUser; onClose: () => void }> = ({ user, onClose }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const [role, setRole] = useState<Role>(user.role);
    const { mutateAsync: patchTeamUser, isPending } = usePatchTeamUser(env);
    const { data: currentPlan } = useApiGetCurrentPlan(env);
    const hasRBAC = planHasRbac(currentPlan?.data);

    const onSubmit = async () => {
        if (role === user.role) {
            onClose();
            return;
        }
        try {
            await patchTeamUser({ id: user.id, role });
            toast({ title: `${user.name}'s role has been updated`, variant: 'success' });
            onClose();
        } catch {
            toast({ title: 'Failed to update role', variant: 'error' });
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit role</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <Input type="email" value={user.email} disabled className="flex-1" />
                        <RoleSelect value={role} onChange={setRole} hasRBAC={hasRBAC} />
                    </div>
                    <StyledLink to="https://nango.dev/docs/guides/platform/security#team-and-roles" type="external" icon>
                        Learn more about roles and permissions
                    </StyledLink>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button variant="primary" onClick={onSubmit} loading={isPending}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export const TeamMembers: React.FC = () => {
    const env = useStore((state) => state.env);
    const { confirm, DialogComponent } = useConfirmDialog();
    const { toast } = useToast();

    const { data } = useTeam(env);
    const { user: me } = useUser();
    const { mutateAsync: deleteTeamUser } = useDeleteTeamUser(env);
    const { mutateAsync: cancelInvitation } = useDeleteInvite(env);
    const { data: currentPlan } = useApiGetCurrentPlan(env);
    const hasRBAC = planHasRbac(currentPlan?.data);

    const [editingUser, setEditingUser] = useState<ApiUser | null>(null);

    const allUsers: ((ApiUser & { is_invitation: false }) | (ApiInvitation & { is_invitation: true }))[] = useMemo(
        () =>
            [
                ...(data?.data.users || []).map((u) => ({ ...u, is_invitation: false as const })),
                ...(data?.data.invitedUsers || []).map((u) => ({ ...u, is_invitation: true as const }))
            ].sort((a, b) => a.email.localeCompare(b.email)),
        [data]
    );

    const { can } = usePermissions();
    const canManageTeam = can(permissions.canManageTeam);

    const onRemoveUser = async (user: ApiUser) => {
        try {
            await deleteTeamUser({ id: user.id });
            toast({ title: `${user.name} has been removed from the team`, variant: 'success' });
        } catch {
            toast({ title: 'Failed to remove user', variant: 'error' });
        }
    };

    const onCancelInvitation = async (invitation: ApiInvitation) => {
        try {
            await cancelInvitation({ email: invitation.email });
            toast({ title: `Invitation for ${invitation.email} has been cancelled`, variant: 'success' });
        } catch {
            toast({ title: 'Failed to cancel invitation', variant: 'error' });
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-heading-sm text-text-strong">Team members</h3>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>
                            <div className="inline-flex items-center gap-0.5">
                                <span>Role</span>
                                <ButtonLink to="https://nango.dev/docs/guides/platform/security#team-and-roles" size="2xs" variant="ghost" target="_blank">
                                    <ExternalLink className="size-3" />
                                </ButtonLink>
                            </div>
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">{/* Actions */}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {allUsers?.map((user) => (
                        <TableRow key={user.id}>
                            <TableCell>{user.name}</TableCell>

                            <TableCell>{user.email}</TableCell>

                            <TableCell>
                                <div className="inline-flex items-center gap-2">
                                    <RoleBadge role={user.role} />
                                    {!hasRBAC && user.role !== 'administrator' && (
                                        <StatusWithIcon
                                            variant="warning"
                                            tooltipContent={
                                                <span>
                                                    RBAC is only available for &apos;Growth&apos; plans. This role is overwritten by &apos;Full access&apos;.{' '}
                                                    <StyledLink to={`/team/billing#plans`} className="text-s">
                                                        Upgrade
                                                    </StyledLink>{' '}
                                                    to reactivate role.
                                                </span>
                                            }
                                        >
                                            <TriangleAlert />
                                        </StatusWithIcon>
                                    )}
                                </div>
                            </TableCell>

                            <TableCell>
                                {user.is_invitation ? (
                                    <div className="inline-flex items-center gap-2 text-text-secondary">
                                        <Dot className="bg-status-warning-icon" /> Invited
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center gap-2 text-text-strong">
                                        <Dot className="bg-status-success-icon" /> Active
                                    </div>
                                )}
                            </TableCell>

                            <TableCell className="text-right">
                                {me?.email === user.email ? null : (
                                    <DropdownMenu modal={false}>
                                        <PermissionGate condition={canManageTeam}>
                                            {(allowed) => (
                                                <DropdownMenuTrigger asChild disabled={!allowed}>
                                                    <IconButton variant="ghost" size="2xs" disabled={!allowed} label="Member actions">
                                                        <Ellipsis />
                                                    </IconButton>
                                                </DropdownMenuTrigger>
                                            )}
                                        </PermissionGate>
                                        <DropdownMenuContent align="end">
                                            {!user.is_invitation && <DropdownMenuItem onSelect={() => setEditingUser(user)}>Edit role</DropdownMenuItem>}

                                            {/* Remove user */}
                                            {!user.is_invitation && (
                                                <DropdownMenuItem
                                                    onSelect={() =>
                                                        confirm({
                                                            title: 'Remove user',
                                                            description: `Are you sure you want to remove ${user.name} from the team?`,
                                                            onConfirm: () => onRemoveUser(user),
                                                            confirmButtonText: 'Remove',
                                                            confirmVariant: 'danger'
                                                        })
                                                    }
                                                >
                                                    <span className="text-status-danger-text">Remove user</span>
                                                </DropdownMenuItem>
                                            )}

                                            {/* Cancel invitation */}
                                            {user.is_invitation && (
                                                <DropdownMenuItem
                                                    onSelect={() =>
                                                        confirm({
                                                            title: 'Revoke invitation',
                                                            description: `Are you sure you want to revoke the invitation for ${user.email}?`,
                                                            onConfirm: () => onCancelInvitation(user),
                                                            confirmButtonText: 'Revoke',
                                                            confirmVariant: 'danger'
                                                        })
                                                    }
                                                >
                                                    <span className="text-status-danger-text">Revoke invitation</span>
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {DialogComponent}
            {editingUser && <EditRoleDialog user={editingUser} onClose={() => setEditingUser(null)} />}
        </div>
    );
};

export const RoleBadge: React.FC<{ role: Role }> = ({ role }) => {
    const roleLabel = useMemo(() => {
        switch (role) {
            case 'production_support':
                return 'Support';
            case 'development_full_access':
                return 'Contributor';
            default:
                return 'Full access';
        }
    }, [role]);

    return <Badge variant="ghost">{roleLabel}</Badge>;
};
