import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import { permissions } from '@nangohq/authz';
import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle, FieldLabel, IconButton, InputGroup, InputGroupInput } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/Form';
import { StyledLink } from '@/components/ui/StyledLink';
import { usePostInvite } from '@/hooks/useInvite';
import { usePermissions } from '@/hooks/usePermissions';
import { planHasRbac, useApiGetCurrentPlan } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { RoleSelect } from './RoleSelect';

import type { Role } from '@nangohq/types';

const inviteRowSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    role: z.enum(['administrator', 'production_support', 'development_full_access'] as const)
});

const inviteSchema = z.object({ invites: z.array(inviteRowSchema).min(1) }).superRefine(({ invites }, ctx) => {
    // Reject duplicate emails (case-insensitive) so one address isn't invited twice / raced across role requests.
    const seen = new Set<string>();
    invites.forEach((row, index) => {
        const email = row.email.trim().toLowerCase();
        if (!email) {
            return; // empty rows are handled by the per-row email() check
        }
        if (seen.has(email)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'This email is already in the list', path: ['invites', index, 'email'] });
        } else {
            seen.add(email);
        }
    });
});

type InviteFormData = z.infer<typeof inviteSchema>;

const emptyRow = (): InviteFormData['invites'][number] => ({ email: '', role: 'administrator' });

export const InviteTeamMembers = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { can } = usePermissions();
    const canManageTeam = can(permissions.canManageTeam);
    const { data: currentPlan } = useApiGetCurrentPlan(env);
    const hasRBAC = planHasRbac(currentPlan?.data);

    const { mutateAsync: inviteAsync } = usePostInvite(env);

    const form = useForm<InviteFormData>({
        resolver: zodResolver(inviteSchema),
        defaultValues: { invites: [emptyRow()] },
        mode: 'onTouched'
    });
    const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'invites' });

    const onSubmit = async ({ invites }: InviteFormData) => {
        // usePostInvite takes a single role per call, so group emails by role and fire one invite each.
        const byRole = new Map<Role, string[]>();
        for (const { email, role } of invites) {
            byRole.set(role, [...(byRole.get(role) ?? []), email]);
        }
        try {
            await Promise.all([...byRole].map(([role, emails]) => inviteAsync({ emails, role })));
            toast({ title: invites.length === 1 ? `Invite sent to ${invites[0]?.email}` : `${invites.length} invites sent`, variant: 'success' });
            // replace() (not form.reset) keeps useFieldArray's internal state in sync — otherwise a later "Add more" resurrects the sent rows.
            replace([emptyRow()]);
            form.clearErrors();
        } catch {
            toast({ title: 'Failed to send invites', variant: 'error' });
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Invite team members</CardTitle>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form id="invite-form" onSubmit={form.handleSubmit(onSubmit)}>
                        <div className="flex flex-col gap-3">
                            <div className="flex gap-2">
                                <div className="flex flex-1 gap-9">
                                    <FieldLabel className="flex-1">Email</FieldLabel>
                                    <FieldLabel className="flex-1">Member role</FieldLabel>
                                </div>
                                <div className="w-8 shrink-0" aria-hidden />
                            </div>
                            {fields.map((row, index) => (
                                <div key={row.id} className="flex items-start gap-2">
                                    <div className="flex flex-1 items-start gap-9">
                                        <FormField
                                            control={form.control}
                                            name={`invites.${index}.email`}
                                            render={({ field, fieldState }) => (
                                                <FormItem className="flex-1">
                                                    <FormControl>
                                                        <InputGroup>
                                                            <InputGroupInput
                                                                placeholder="name@company.com"
                                                                autoComplete="off"
                                                                aria-label="Email address"
                                                                {...field}
                                                                aria-invalid={!!fieldState.error}
                                                            />
                                                        </InputGroup>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <div className="flex-1">
                                            <Controller
                                                control={form.control}
                                                name={`invites.${index}.role`}
                                                render={({ field }) => (
                                                    <RoleSelect value={field.value} onChange={field.onChange} hasRBAC={hasRBAC} triggerClassName="w-full" />
                                                )}
                                            />
                                        </div>
                                    </div>
                                    <div className="w-8 shrink-0">
                                        {fields.length > 1 && (
                                            <IconButton variant="ghost" size="sm" label="Remove invite" disabled={!canManageTeam} onClick={() => remove(index)}>
                                                <X />
                                            </IconButton>
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div>
                                <Button type="button" variant="secondary" size="sm" disabled={!canManageTeam} onClick={() => append(emptyRow())}>
                                    <Plus /> Add more
                                </Button>
                            </div>
                        </div>
                    </form>
                </Form>
            </CardContent>
            <CardFooter>
                <div className="flex w-full items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5">
                        <StyledLink to="https://nango.dev/docs/guides/platform/security#team-and-roles" type="external" icon variant="muted">
                            Learn more about team access roles.
                        </StyledLink>
                    </div>
                    <PermissionGate condition={canManageTeam}>
                        {(allowed) => (
                            <Button type="submit" form="invite-form" variant="primary" size="sm" disabled={!allowed} loading={form.formState.isSubmitting}>
                                Invite
                            </Button>
                        )}
                    </PermissionGate>
                </div>
            </CardFooter>
        </Card>
    );
};
