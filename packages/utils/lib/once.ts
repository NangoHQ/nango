// Ensures a function is only called once.
export function once<T extends any[]>(fn: (...args: T) => void): (...args: T) => void {
    let called = false;

    return function (...args: T) {
        if (!called) {
            called = true;
            fn(...args);
        }
    };
}
