interface DefaultLayoutI {
    children: React.ReactNode;
}

export default function DefaultLayout({ children }: DefaultLayoutI) {
    return (
        <div className="flex min-h-full flex-col justify-center py-10 sm:px-6 lg:px-8">
            <div className="flex flex-col bg-bg-elevated border border-border-disabled p-[60px] mx-auto">
                <div className="pb-[20px]">
                    <img className="mx-auto h-14 w-auto" src="/logo-light.svg" alt="Nango" />
                </div>
                {children}
            </div>
        </div>
    );
}
