let shuttingDown = false;

export function setShuttingDown(value: boolean) {
    shuttingDown = value;
}

export function isShuttingDown() {
    return shuttingDown;
}
