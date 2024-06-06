import path from 'path';
import fs from 'fs/promises';

export const copyDirectoryAndContents = async (source: string, destination: string) => {
    await fs.mkdir(destination, { recursive: true });

    const files = await fs.readdir(source, { withFileTypes: true });

    for (const file of files) {
        const sourcePath = path.join(source, file.name);
        const destinationPath = path.join(destination, file.name);

        if (file.isDirectory()) {
            await copyDirectoryAndContents(sourcePath, destinationPath);
        } else {
            await fs.copyFile(sourcePath, destinationPath);
        }
    }
};
