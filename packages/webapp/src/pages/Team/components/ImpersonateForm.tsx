import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { Form, FormControl, FormField, FormItem, FormMessage } from '../../../components-v2/ui/form';
import { Input } from '../../../components-v2/ui/input';
import { apiAdminImpersonate } from '../../../hooks/useAdmin';
import { useStore } from '../../../store';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';
import { Label } from '@/components-v2/ui/label';

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
        <div className="w-100 flex flex-col gap-3 p-6 border border-border-gray rounded-md relative">
            <h3 className="text-heading-sm text-text-primary absolute top-[-12px] left-3 bg-bg-surface px-1">Nango admin</h3>
            <h3 className="text-heading-sm text-text-primary">Impersonate account</h3>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="account_uuid">Account UUID</Label>
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
                        <Label htmlFor="login_reason">Login reason</Label>
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
                    <Button variant="destructive" className="self-end">
                        Impersonate
                    </Button>
                    {form.formState.errors.root && <p className="mt-2 mx-4 text-sm text-red-600">{form.formState.errors.root.message}</p>}
                </form>
            </Form>
        </div>
    );
};
