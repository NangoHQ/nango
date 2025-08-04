export interface EmailProvider<T> {
    send(email: string, subject: string, html: string): Promise<T>;
}
