import { Ellipsis, ExternalLink, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import { permissions } from '@nangohq/authz';

import { RoleSelect } from './RoleSelect';
import { useDeleteTeamUser, usePatchTeamUser, useTeam } from '../../../hooks/useTeam';
import { useStore } from '../../../store';
import { Dot } from '@/components-v2/Dot';
import { PermissionGate } from '@/components-v2/PermissionGate';
import { StatusWithIcon } from '@/components-v2/StatusWithIcon';
import { StyledLink } from '@/components-v2/StyledLink';
import { Badge } from '@/components-v2/ui/badge';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components-v2/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components-v2/ui/dropdown-menu';
import { Input } from '@/components-v2/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useDeleteInvite } from '@/hooks/useInvite';
import { usePermissions } from '@/hooks/usePermissions';
import { planHasRbac, useApiGetCurrentPlan } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useUser } from '@/hooks/useUser';

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
                        <Button variant="secondary">Cancel</Button>
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
            <h3 className="text-heading-sm text-text-primary">Team members</h3>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>
                            <div className="inline-flex items-center gap-0.5">
                                <span>Role</span>
                                <ButtonLink to="https://nango.dev/docs/guides/platform/security#team-and-roles" size="icon" variant="ghost" target="_blank">
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
                                                    <StyledLink to={`/${env}/team/billing#plans`} className="text-s">
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
                                        <Dot className="bg-feedback-warning-fg" /> Invited
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center gap-2 text-text-primary">
                                        <Dot className="bg-feedback-success-fg" /> Active
                                    </div>
                                )}
                            </TableCell>

                            <TableCell className="text-right">
                                {me?.email === user.email ? null : (
                                    <DropdownMenu modal={false}>
                                        <PermissionGate condition={canManageTeam}>
                                            {(allowed) => (
                                                <DropdownMenuTrigger asChild disabled={!allowed}>
                                                    <Button variant="ghost" size="icon" disabled={!allowed}>
                                                        <Ellipsis />
                                                    </Button>
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
                                                            confirmVariant: 'destructive'
                                                        })
                                                    }
                                                >
                                                    <span className="text-feedback-error-fg">Remove user</span>
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
                                                            confirmVariant: 'destructive'
                                                        })
                                                    }
                                                >
                                                    <span className="text-feedback-error-fg">Revoke invitation</span>
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
