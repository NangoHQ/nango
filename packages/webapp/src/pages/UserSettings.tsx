import { useState, useEffect } from 'react';
import { Prism } from '@mantine/prism';
import { toast } from 'react-toastify';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import { useEditUserNameAPI, useGetUserAPI } from '../utils/api';

export default function UserSettings() {
    const [loaded, setLoaded] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [userEditMode, setUserEditMode] = useState(false);

    const getUserInfo = useGetUserAPI();
    const editUserNameAPI = useEditUserNameAPI();

    useEffect(() => {
        const getUser = async () => {
            const res = await getUserInfo();

            if (res?.status === 200) {
                const user = (await res.json())['user'];
                setName(user['name']);
                setEmail(user['email']);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getUser();
        }
    }, [getUserInfo, loaded, setLoaded]);

    const handleUserNameEdit = (_: React.SyntheticEvent) => {
        setUserEditMode(true);
    };

    const handleUserNameSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            name: { value: string };
        };

        const res = await editUserNameAPI(target.name.value);

        if (res?.status === 200) {
            toast.success('User\'s name updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setUserEditMode(false);
            setName(target.name.value);
        }
    };


    return (
        <DashboardLayout selectedItem={LeftNavBarItems.UserSettings}>
            <div className="h-full mb-20">
                <h2 className="text-left text-3xl font-semibold tracking-tight text-white mb-12">User Settings</h2>
                <div className="border border-border-gray rounded-md h-fit pt-6 pb-14">
                    <div>
                        <div className="mx-8 mt-8">
                            <div className="flex flex-col">
                                <label htmlFor="public_key" className="text-text-light-gray block text-sm font-semibold mb-2">
                                    Name
                                </label>
                                <div className="flex">
                                    {userEditMode && (
                                        <form className="mt-2 w-full flex" onSubmit={handleUserNameSave}>
                                            <input
                                                id="name"
                                                name="name"
                                                defaultValue={name}
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
                                    {!userEditMode && (
                                        <div className="flex w-full">
                                            <Prism language="bash" colorScheme="dark" className="w-full">
                                                {name}
                                            </Prism>
                                            <button
                                                onClick={handleUserNameEdit}
                                                className="hover:bg-hover-gray bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="mx-8 mt-8">
                            <div className="flex">
                                <label htmlFor="public_key" className="text-text-light-gray block text-sm font-semibold mb-2">
                                    Email
                                </label>
                            </div>
                            <Prism language="bash" colorScheme="dark">
                                {email}
                            </Prism>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
