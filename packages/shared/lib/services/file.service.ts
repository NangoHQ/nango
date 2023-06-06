class FileService {
    async upload(_fileContents: string, fileName: string): Promise<string> {
        return Promise.resolve(fileName);
    }
}

export default new FileService();
