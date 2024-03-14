interface DefaultLayoutI {
    children: React.ReactNode;
}

export default function DefaultLayout({ children }: DefaultLayoutI) {
    return (
        <div className="flex min-h-full flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md">
                <img className="mx-auto h-20 w-auto" src="/logo-dark-background-vertical.svg" alt="Nango Logo" />
            </div>
            {children}
        </div>
    );
}
