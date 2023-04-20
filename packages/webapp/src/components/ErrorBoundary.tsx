import React, { Component, ErrorInfo } from 'react';

interface Props {
    children: React.ReactNode;
    //TODO: create a custom fallback component according to nango's UI
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
                <div>
                    <h2>Oops, there is an error!</h2>
                    <button type="button" onClick={() => this.setState({ hasError: false })}>
                        Try again?
                    </button>
                </div>
            );
        }

        // Return children components in case of no error
        return this.props.children;
    }
}

export default ErrorBoundary;
