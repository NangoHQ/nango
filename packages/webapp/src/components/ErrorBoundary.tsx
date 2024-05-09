import type { ErrorInfo } from 'react';
import type React from 'react';
import { Component } from 'react';

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = { hasError: false };
    }
    static getDerivedStateFromError(_: Error) {
        return { hasError: true };
    }
    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error({ error, errorInfo });
    }
    render() {
        // Check if the error is thrown
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex h-screen text-white justify-center items-center">
                    <div className="mx-auto">
                        <img className="h-8" src="/logo-circled.svg" alt="Nango" />
                        <h2 className="text-emphasis mt-6 text-2xl font-medium">It&apos;s not you, it&apos;s us.</h2>
                        <p className="text-default mt-4 mb-6 max-w-2xl text-sm">
                            Something went wrong on our end. Get in touch with our support team, and we’ll get it fixed right away for you.
                        </p>

                        <button
                            onClick={() => this.setState({ hasError: false })}
                            className="mt-auto mb-4 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300"
                        >
                            Try again?
                        </button>
                    </div>
                </div>
            );
        }

        // Return children components in case of no error
        return this.props.children;
    }
}

export default ErrorBoundary;
