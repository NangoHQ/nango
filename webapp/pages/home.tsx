import { useRouter } from 'next/router';

export default function Home() {
    const router = useRouter();

    const getAccountButtonClicked = async () => {
        const options: RequestInit = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include' as RequestCredentials,
            cache: 'no-store' as RequestCache
        };

        fetch('http://localhost:3003/account', options);
    };

    const logoutButtonClicked = async () => {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const res = await fetch('http://localhost:3003/logout', options);

        if (res.status === 200) {
            router.push('/');
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
        </div>
    );
}
