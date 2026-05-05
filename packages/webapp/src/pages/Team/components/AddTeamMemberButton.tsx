import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { permissions } from '@nangohq/authz';

import { RoleSelect } from './RoleSelect';
import { PermissionGate } from '@/components-v2/PermissionGate';
import { StyledLink } from '@/components-v2/StyledLink';
import { Button } from '@/components-v2/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components-v2/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components-v2/ui/form';
import { InputGroup, InputGroupInput } from '@/components-v2/ui/input-group';
import { usePostInvite } from '@/hooks/useInvite';
import { usePermissions } from '@/hooks/usePermissions';
import { planHasRbac, useApiGetCurrentPlan } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';

const inviteSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    role: z.enum(['administrator', 'production_support', 'development_full_access'] as const)
});

type InviteFormData = z.infer<typeof inviteSchema>;

export const AddTeamMemberButton = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { can } = usePermissions();
    const canManageTeam = can(permissions.canManageTeam);
    const { data: currentPlan } = useApiGetCurrentPlan(env);
    const hasRBAC = planHasRbac(currentPlan?.data);

    const [isOpen, setIsOpen] = useState(false);

    const { mutateAsync: inviteAsync, isPending } = usePostInvite(env);

    const form = useForm<InviteFormData>({
        resolver: zodResolver(inviteSchema),
        defaultValues: { email: '', role: 'administrator' },
        mode: 'onTouched'
    });

    const onSubmit = async ({ email, role }: InviteFormData) => {
        try {
            await inviteAsync({ emails: [email], role });
            toast({ title: `Invite sent to ${email}`, variant: 'success' });
            setIsOpen(false);
            form.reset();
        } catch {
            toast({ title: 'Failed to invite team member', variant: 'error' });
        }
    };

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                setIsOpen(open);
                if (!open) form.reset();
            }}
        >
            <PermissionGate condition={canManageTeam}>
                {(allowed) => (
                    <DialogTrigger asChild>
                        <Button size="lg" disabled={!allowed}>
                            <Plus /> Add Team Member
                        </Button>
                    </DialogTrigger>
                )}
            </PermissionGate>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Invite a team member</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    <Form {...form}>
                        <form id="invite-form" onSubmit={form.handleSubmit(onSubmit)}>
                            <div className="flex items-start gap-2">
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field, fieldState }) => (
                                        <FormItem className="flex-1">
                                            <FormControl>
                                                <InputGroup>
                                                    <InputGroupInput
                                                        placeholder="name@company.com"
                                                        autoComplete="off"
                                                        {...field}
                                                        aria-invalid={!!fieldState.error}
                                                    />
                                                </InputGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Controller
                                    control={form.control}
                                    name="role"
                                    render={({ field }) => <RoleSelect value={field.value} onChange={field.onChange} hasRBAC={hasRBAC} />}
                                />
                            </div>
                        </form>
                    </Form>

                    <StyledLink to="https://nango.dev/docs/guides/platform/security#team-and-roles" type="external" icon>
                        Learn more about roles and permissions
                    </StyledLink>
                </div>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="secondary">Cancel</Button>
                    </DialogClose>
                    <Button type="submit" form="invite-form" variant="primary" loading={isPending}>
                        Invite
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
