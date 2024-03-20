import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useInviteSignupAPI, useSignupAPI } from '../utils/api';
import { isCloud, isEnterprise } from '../utils/utils';
import { useSignin, User } from '../utils/user';
import DefaultLayout from '../layout/DefaultLayout';
import GoogleButton from '../components/ui/button/Auth/Google';

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
                <div className="flex flex-col justify-center">
                    <div className="flex flex-col justify-center w-80 mx-4">
                        <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight text-white">Sign up</h2>
                        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
                            <div>
                                <div className="mt-1">
                                    <input
                                        id="name"
                                        name="name"
                                        type="text"
                                        autoComplete="name"
                                        defaultValue={invitedName}
                                        required
                                        placeholder="Name"
                                        minLength={1}
                                        maxLength={100}
                                        className="border-border-gray bg-dark-600 placeholder-dark-500 text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-[14px] placeholder-gray-400 shadow-sm focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="mt-1">
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        defaultValue={invitedEmail}
                                        placeholder="Email"
                                        required
                                        readOnly={!isEnterprise()}
                                        className={`${isEnterprise() ? '' : 'cursor-not-allowed outline-none border-transparent focus:border-transparent focus:ring-0 border-none '}bg-bg-black text-text-light-gray block h-11 focus:outline-none w-full appearance-none rounded-md px-3 py-2 text-[14px] shadow-sm`}
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="mt-1">
                                    <input
                                        id="password"
                                        name="password"
                                        type="password"
                                        placeholder="Password"
                                        autoComplete="current-password"
                                        required
                                        minLength={8}
                                        maxLength={50}
                                        className="border-border-gray bg-dark-600 placeholder-dark-500 text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-[14px] placeholder-gray-400 shadow-sm focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="grid">
                                <button
                                    type="submit"
                                    className="bg-white flex h-11 justify-center rounded-md border px-4 pt-3 text-[14px] text-black shadow hover:border-2 active:ring-2 active:ring-offset-2"
                                >
                                    Sign up
                                </button>
                                {serverErrorMessage && <p className="mt-6 place-self-center text-sm text-red-600">{serverErrorMessage}</p>}
                            </div>
                        </form>
                        {isCloud() && (
                            <>
                                <div className="flex items-center justify-center my-4 text-xs">
                                    <div className="border-t border-gray-600 flex-grow mr-7"></div>
                                    <span className="text-dark-500">or continue with</span>
                                    <div className="border-t border-gray-600 flex-grow ml-7"></div>
                                </div>
                                <GoogleButton
                                    text="Sign up with Google"
                                    invitedAccountID={invitedAccountID}
                                    token={token}
                                    setServerErrorMessage={setServerErrorMessage}
                                />
                            </>
                        )}
                    </div>
                    <div className="grid w-full">
                        <div className="mt-8 flex text-xs">
                            <p className="text-dark-500">
                                By signing in, you agree to our
                                <a href="https://www.nango.dev/terms" target="_blank" rel="noreferrer" className="text-white ml-1">
                                    Terms of Service
                                </a>
                                <span className="text-dark-500 ml-1">and</span>
                                <a href="https://www.nango.dev/privacy-policy" target="_blank" rel="noreferrer" className="text-white ml-1">
                                    Privacy Policy
                                </a>
                                <span className="text-dark-500">.</span>
                            </p>
                        </div>
                    </div>
                </div>
            </DefaultLayout>
        </>
    );
}
