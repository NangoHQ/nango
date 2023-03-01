import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Code, Snippet } from '@geist-ui/core';

export default function Home() {
    const navigate = useNavigate();

    const getAccountButtonClicked = async () => {
        const options: RequestInit = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include' as RequestCredentials,
            cache: 'no-store' as RequestCache
        };

        let res = await fetch('/api/v1/account', options);

        if (res.status === 200) {
            const account = await res.json();
            console.log(account);
        } else {
            toast.error('Server error...', { position: toast.POSITION.BOTTOM_CENTER });
        }
    };

    const logoutButtonClicked = async () => {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const res = await fetch('/api/v1/logout', options);

        if (res.status === 200) {
            localStorage.clear();
            navigate('/signin', { replace: true });
        }
    };

    return (
        <div>
            <button
                className="border-border-blue bg-bg-dark-blue active:ring-border-blue mt-4 flex h-12 place-self-center rounded-md border px-4 pt-3 text-base font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                onClick={getAccountButtonClicked}
            >
                Get Account
            </button>
            <button
                className="border-border-blue bg-bg-dark-blue active:ring-border-blue mt-4 flex h-12 place-self-center rounded-md border px-4 pt-3 text-base font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                onClick={logoutButtonClicked}
            >
                Logout
            </button>
            <Code block my={0}>
                This is code
            </Code>
            <Snippet text="yarn add @geist-ui/core" width="300px" />
        </div>
    );
}
