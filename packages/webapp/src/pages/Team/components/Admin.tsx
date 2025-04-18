import { useState } from 'react';
import { Button } from '../../../components/ui/button/Button';
import { useStore } from '../../../store';
import { apiFetch } from '../../../utils/api';

export const Admin: React.FC = () => {
    const env = useStore((state) => state.env);
    const [error, setError] = useState<string | null>(null);

    const redirectToAccount = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            account_uuid: { value: string };
            login_reason: { value: string };
        };
        const payload = {
            account_uuid: target.account_uuid.value,
            login_reason: target.login_reason.value
        };

        const res = await apiFetch(`/api/v1/account/admin/switch?env=${env}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.status === 200) {
            window.location.reload();
        } else {
            setError(JSON.stringify(await res.json()));
        }
    };

    return (
        <div className="border border-border-gray rounded-md h-fit mt-4 pt-6 pb-14 text-white">
            <div className="px-8">
                <div className="mt-4">
                    <span>Login as a different user</span>
                    <form onSubmit={redirectToAccount} className="flex flex-col mt-2 gap-4">
                        <div>
                            <input
                                type="text"
                                placeholder="Account UUID"
                                name="account_uuid"
                                className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-1/2 appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                            />
                        </div>
                        <div>
                            <input
                                type="text"
                                placeholder="Login reason"
                                name="login_reason"
                                className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                            />
                        </div>
                        <div>
                            <Button variant={'danger'}>Login To Account</Button>
                        </div>
                    </form>
                    {error && <p className="mt-2 mx-4 text-sm text-red-600">{error}</p>}
                </div>
            </div>
        </div>
    );
};
