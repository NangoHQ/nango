import { useState, useEffect } from 'react';
import { Prism } from '@mantine/prism';
import { toast } from 'react-toastify';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import { useEditAccountNameAPI, useGetAccountAPI } from '../utils/api';

export default function AccountSettings() {
    const [loaded, setLoaded] = useState(false);
    const [accountName, setAccountName] = useState('');
    const [accountEditMode, setAccountEditMode] = useState(false);

    const getAccountInfo = useGetAccountAPI();
    const editAccountNameAPI = useEditAccountNameAPI();

    useEffect(() => {
        const getAccount = async () => {
            const res = await getAccountInfo();

            if (res?.status === 200) {
                const account = (await res.json())['account'];
                setAccountName(account['name']);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getAccount();
        }
    }, [getAccountInfo, loaded, setLoaded]);

    const handleAccountNameEdit = (_: React.SyntheticEvent) => {
        setAccountEditMode(true);
    };

    const handleAccountNameSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            account_name: { value: string };
        };

        const res = await editAccountNameAPI(target.account_name.value);

        if (res?.status === 200) {
            toast.success('Account name updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setAccountEditMode(false);
            setAccountName(target.account_name.value);
        }
    };


    return (
        <DashboardLayout selectedItem={LeftNavBarItems.ProjectSettings}>
                <div className="mx-auto w-largebox">
                    <div className="mx-20 h-full mb-20">
                        <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Account Settings</h2>
                        <div className="border border-border-gray rounded-md h-fit pt-6 pb-14">
                            <div>
                                <div className="mx-8 mt-8">
                                    <div className="flex flex-col">
                                        <label htmlFor="public_key" className="text-text-light-gray block text-sm font-semibold mb-2">
                                            Account Name
                                        </label>
                                        <div className="flex">
                                            {accountEditMode && (
                                                <form className="mt-2 w-full flex" onSubmit={handleAccountNameSave}>
                                                    <input
                                                        id="account_name"
                                                        name="account_name"
                                                        defaultValue={accountName}
                                                        className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none"
                                                        required
                                                    />
                                                    <button
                                                        type="submit"
                                                        className="border-border-blue bg-bg-dark-blue active:ring-border-blue flex h-11 rounded-md border ml-4 px-4 pt-3 text-sm font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                                    >
                                                        Save
                                                    </button>
                                                </form>
                                            )}
                                            {!accountEditMode && (
                                                <div className="flex w-full">
                                                    <Prism language="bash" colorScheme="dark" className="w-full">
                                                        {accountName}
                                                    </Prism>
                                                    <button
                                                        onClick={handleAccountNameEdit}
                                                        className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                                    >
                                                        Edit
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            Set username
        </DashboardLayout>
    );
}
