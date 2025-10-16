const fs = require('fs');
const path = require('path');

function atomicWriteFileSync(filePath, data, options) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tempFile = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempFile, data, options);
  fs.renameSync(tempFile, filePath);
}

module.exports = atomicWriteFileSync;
