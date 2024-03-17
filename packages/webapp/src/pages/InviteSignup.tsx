import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useInviteSignupAPI, useSignupAPI } from '../utils/api';
import { isEnterprise } from '../utils/utils';
import { useSignin, User } from '../utils/user';
import DefaultLayout from '../layout/DefaultLayout';

export default function InviteSignup() {
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [invitedName, setName] = useState('');
    const [invitedEmail, setEmail] = useState('');
    const [invitedAccountID, setAccountID] = useState<number>();
    const navigate = useNavigate();
    const getInvitee = useInviteSignupAPI();
    const signin = useSignin();
    const signupAPI = useSignupAPI();

    const { token } = useParams();

    useEffect(() => {
        const getInvite = async () => {
            const res = await getInvitee(token as string);

            if (res?.status === 200) {
                const invitee = await res.json();
                const { name, email, account_id } = invitee;
                setName(name);
                setEmail(email);
                setAccountID(Number(account_id));
            } else {
                isEnterprise() ? navigate('/signin') : navigate('/signup');
            }
        };

        if (!loaded) {
            setLoaded(true);
            getInvite();
        }
    }, [navigate, getInvitee, token, loaded, setLoaded]);

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        setServerErrorMessage('');

        const target = e.target as typeof e.target & {
            name: { value: string };
            email: { value: string };
            password: { value: string };
        };

        const res = await signupAPI(target.name.value, target.email.value, target.password.value, invitedAccountID, token as string);

        if (res?.status === 200) {
            const data = await res.json();
            const user: User = data['user'];
            signin(user);
            navigate('/');
        } else if (res != null) {
            const errorMessage = (await res.json()).error;
            setServerErrorMessage(errorMessage);
        }
    };

    return (
        <>
            <DefaultLayout>
                <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md">
                    <div className="bg-bg-dark-gray py-8 px-4 shadow sm:rounded-lg sm:px-10">
                        <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight text-white">Sign up</h2>
                        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <label htmlFor="name" className="text-text-light-gray block text-sm font-semibold">
                                    Name
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="name"
                                        name="name"
                                        type="text"
                                        autoComplete="name"
                                        defaultValue={invitedName}
                                        required
                                        minLength={1}
                                        maxLength={100}
                                        className="border-border-gray bg-bg-black text-text-light-gray focus:border-blue focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                    Email
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        defaultValue={invitedEmail}
                                        required
                                        readOnly={!isEnterprise()}
                                        className={`${isEnterprise() ? 'focus:border-blue border-border-gray focus:border-blue focus:ring-blue block ' : 'cursor-not-allowed outline-none border-transparent focus:border-transparent focus:ring-0 border-none '}bg-bg-black text-text-light-gray block h-11 focus:outline-none w-full appearance-none rounded-md px-3 py-2 text-base shadow-sm`}
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="password" className="text-text-light-gray block text-sm font-semibold">
                                    Password
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        autoComplete="current-password"
                                        required
                                        minLength={8}
                                        maxLength={50}
                                        className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="grid">
                                <button
                                    type="submit"
                                    className="border-border-blue bg-bg-dark-blue active:ring-border-blue mt-4 flex h-12 place-self-center rounded-md border px-4 pt-3 text-base font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                >
                                    Sign up
                                </button>
                                {serverErrorMessage && <p className="mt-6 place-self-center text-sm text-red-600">{serverErrorMessage}</p>}
                            </div>
                        </form>
                    </div>
                    <div className="grid">
                        <div className="mt-4 flex place-self-center text-sm">
                            <p className="text-text-light-gray">Already have an account?</p>
                            <Link to="/signin" className="text-text-blue hover:text-text-light-blue ml-1">
                                Sign in
                            </Link>
                        </div>
                    </div>
                    <div className="grid">
                        <div className="mt-4 flex place-self-center text-sm">
                            <p className="text-text-light-gray">By signing up, you agree to our</p>
                            <a href="https://www.nango.dev/terms" target="_blank" rel="noreferrer" className="text-text-blue hover:text-text-light-blue ml-1">
                                Terms of Service
                            </a>
                            <p className="text-text-light-gray ml-1">and</p>
                            <a
                                href="https://www.nango.dev/privacy-policy"
                                target="_blank"
                                rel="noreferrer"
                                className="text-text-blue hover:text-text-light-blue ml-1"
                            >
                                Privacy Policy
                            </a>
                            <p className="text-text-light-gray">.</p>
                        </div>
                    </div>
                </div>
            </DefaultLayout>
        </>
    );
}
