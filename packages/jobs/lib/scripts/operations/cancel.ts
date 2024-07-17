export async function cancelScript({ taskId }: { taskId: string }): Promise<void> {
    // TODO
    console.log(taskId);
    await new Promise((resolve) => setTimeout(resolve, 1));
    return;
}
