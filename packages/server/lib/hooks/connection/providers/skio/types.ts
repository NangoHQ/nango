export interface OrdersResponse {
    data: {
        Orders: [];
    };
}

export interface Error {
    errors: {
        message: string;
        extensions: {
            path: string;
            code: string;
        };
    }[];
}
