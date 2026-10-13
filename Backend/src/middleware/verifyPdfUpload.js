const fs = require('fs');

function verifyPdfUpload(req, res, next) {
  if (!req.file) return next();
  try {
    const descriptor = fs.openSync(req.file.path, 'r');
    const signature = Buffer.alloc(5);
    const read = fs.readSync(descriptor, signature, 0, signature.length, 0);
    fs.closeSync(descriptor);
    if (read !== 5 || signature.toString('ascii') !== '%PDF-') {
      fs.unlink(req.file.path, () => {});
      return res.status(415).json({ error: 'Le contenu du fichier ne correspond pas à un PDF valide' });
    }
    next();
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    next(error);
  }
}

module.exports = verifyPdfUpload;
