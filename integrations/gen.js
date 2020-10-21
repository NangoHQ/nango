const fs = require('fs')
const path = require('path');
const root = __dirname;

const stream = fs.createWriteStream(path.join(root, "index.ts"), {flags:'w'});

function visit(dir, ext, pkgPrefix) {
    const integrations = fs.readdirSync(dir)
    integrations.forEach(name => {
        const packageName = pkgPrefix + name
        const file = path.join(dir, name)
        const s = fs.lstatSync(file)
        if (s.isDirectory()) {
            visit(file, ext, packageName + '/')
            return
        }
        if (name.endsWith(ext)) {
            const imp = path.relative(root, file)
            stream.write("import '" + packageName + "'\n")
        }
    });
};

visit(root, 'json', './')

stream.end();