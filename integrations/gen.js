const fs = require('fs')
const path = require('path');
const chokidar = require('chokidar');
const root = __dirname;

function generate(reason) {
    function visit(dir, ext, pkgPrefix) {
        if (pkgPrefix !== './') {
            throw new "Error: No directories within integrations allowed."
        }
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

    console.log('Generation started: ', reason)
    const stream = fs.createWriteStream(path.join(root, "index.ts"), {flags:'w'});
    visit(root, 'json', './')
    stream.end();
    console.log('Generation finished')
}

generate('Initial generation');

chokidar.watch(root, {ignoreInitial: true, ignored: /.[j|t]s$/})
    .on('add', path => generate('New file added: ' + path))
    .on('unlink', path => generate('File removed: ' + path));