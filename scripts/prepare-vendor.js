/* Copy the few browser libraries the renderer needs into src/renderer/vendor.
 * The renderer deliberately has no bundler and no node integration, so the
 * copies are plain static files shipped with the app.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendor = path.join(root, 'src', 'renderer', 'vendor');

function copy(source, target) {
  if (!fs.existsSync(source)) {
    console.warn('[prepare-vendor] missing:', path.relative(root, source));
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log('[prepare-vendor] copied', path.relative(root, target));
}

function copyDir(source, target) {
  if (!fs.existsSync(source)) {
    console.warn('[prepare-vendor] missing dir:', path.relative(root, source));
    return;
  }
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

fs.mkdirSync(vendor, { recursive: true });

const nm = path.join(root, 'node_modules');
copy(path.join(nm, 'three', 'build', 'three.module.js'), path.join(vendor, 'three.module.js'));
copy(path.join(nm, 'three', 'build', 'three.core.js'), path.join(vendor, 'three.core.js'));

copy(path.join(nm, 'pdfjs-dist', 'build', 'pdf.mjs'), path.join(vendor, 'pdf.mjs'));
copy(path.join(nm, 'pdfjs-dist', 'build', 'pdf.worker.mjs'), path.join(vendor, 'pdf.worker.mjs'));
copyDir(path.join(nm, 'pdfjs-dist', 'cmaps'), path.join(vendor, 'cmaps'));
copyDir(path.join(nm, 'pdfjs-dist', 'standard_fonts'), path.join(vendor, 'standard_fonts'));
copyDir(path.join(nm, 'pdfjs-dist', 'wasm'), path.join(vendor, 'wasm'));

copy(
  path.join(nm, '@mozilla', 'readability', 'Readability.js'),
  path.join(vendor, 'Readability.js')
);

console.log('[prepare-vendor] done');
