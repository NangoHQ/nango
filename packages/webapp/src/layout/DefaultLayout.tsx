interface DefaultLayoutI {
    children: React.ReactNode;
}

export default function DefaultLayout({ children }: DefaultLayoutI) {
    return (
        <div className="flex min-h-full flex-col justify-center py-10 sm:px-6 lg:px-8">
            <div className="bg-dark-800 border border-[#141417] shadow shadow-zinc-900 p-12 mx-auto px-16">
                <div className="">
                    <img className="mx-auto h-14 w-auto" src="/logo-dark.svg" alt="Nango" />
                </div>
                {children}
            </div>
        </div>
    );
}
