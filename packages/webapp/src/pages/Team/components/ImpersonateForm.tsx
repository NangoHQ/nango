import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { Button, Card, CardContent, CardHeader, CardTitle, FieldLabel, Input } from '@nangohq/design-system';

import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Form, FormControl, FormField, FormItem, FormMessage } from '../../../components/ui/Form';
import { apiAdminImpersonate } from '../../../hooks/useAdmin';
import { useStore } from '../../../store';

const ImpersonateFormSchema = z.object({
    account_uuid: z.string().uuid(),
    login_reason: z.string().min(1).max(1024)
});

type ImpersonateFormData = z.infer<typeof ImpersonateFormSchema>;

export const ImpersonateForm: React.FC = () => {
    const env = useStore((state) => state.env);

    const form = useForm<ImpersonateFormData>({
        resolver: zodResolver(ImpersonateFormSchema),
        defaultValues: {
            account_uuid: '',
            login_reason: ''
        }
    });

    const onSubmit = async (data: ImpersonateFormData) => {
        const res = await apiAdminImpersonate(env, { accountUUID: data.account_uuid, loginReason: data.login_reason });
        if (res.res.status === 200) {
            window.location.reload();
        } else {
            form.setError('root', { message: JSON.stringify(res.json) });
        }
    };

    return (
        <div className="relative w-100">
            <h3 className="text-heading-sm text-text-strong absolute top-[-12px] left-3 z-10 bg-surface-canvas px-1">Nango admin</h3>
            <Card>
                <CardHeader>
                    <CardTitle>Impersonate account</CardTitle>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
                            <div className="flex flex-col gap-2">
                                <FieldLabel htmlFor="account_uuid">Account UUID</FieldLabel>
                                <FormField
                                    control={form.control}
                                    name="account_uuid"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <Input placeholder="Account UUID" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <FieldLabel htmlFor="login_reason">Login reason</FieldLabel>
                                <FormField
                                    control={form.control}
                                    name="login_reason"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <Input placeholder="Login reason" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <Alert variant="warning">
                                <TriangleAlert />
                                <AlertDescription>
                                    <span>Impersonating an account will allow you to login as that account and perform actions on their behalf.</span>
                                </AlertDescription>
                            </Alert>
                            <div className="self-end">
                                <Button type="submit" variant="danger">
                                    Impersonate
                                </Button>
                            </div>
                            {form.formState.errors.root && <p className="mt-2 mx-4 text-sm text-status-danger-text">{form.formState.errors.root.message}</p>}
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
};
