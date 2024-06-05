import path from 'path';
import * as fs from 'fs';

export const copyDirectoryAndContents = async (source: string, destination: string) => {
    await fs.promises.mkdir(destination, { recursive: true });

    const files = await fs.promises.readdir(source, { withFileTypes: true });

    for (const file of files) {
        const sourcePath = path.join(source, file.name);
        const destinationPath = path.join(destination, file.name);

        if (file.isDirectory()) {
            await copyDirectoryAndContents(sourcePath, destinationPath);
        } else {
            await fs.promises.copyFile(sourcePath, destinationPath);
        }
    }
};
