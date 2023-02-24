export default function Home() {
    const buttonClicked = async (event: any) => {
        const options = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include' as RequestCredentials
        };

        const res = await fetch('http://localhost:3003/account', options);

        if (res.status === 200) {
            console.log(res);
            console.log(await res.json());
        } else {
            console.log(res);
            console.log(await res.json());
        }
    };

    return (
        <div>
            <button className="mt-4 ml-4" onClick={buttonClicked}>
                Click me
            </button>
        </div>
    );
}
