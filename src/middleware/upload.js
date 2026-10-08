'use strict';

const multer = require('multer');
const config = require('../config');

// Memory storage so invalid files are rejected (magic-byte check in storage.saveImage) before anything touches disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxImageBytes,
    files: config.MAX_IMAGES_PER_LISTING,
    fields: 40,
    fieldSize: 20 * 1024,
  },
  fileFilter(req, file, cb) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
      err.message = 'Only JPEG, PNG or WebP images are allowed';
      return cb(err);
    }
    return cb(null, true);
  },
});

module.exports = { uploadImages: upload.array('images', config.MAX_IMAGES_PER_LISTING) };
