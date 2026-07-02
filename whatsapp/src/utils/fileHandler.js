const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const cron = require('node-cron');

// Pastikan folder temp ada
const tempDir = path.join(__dirname, '../../temp');
const uploadDir = path.join(tempDir, 'uploads');
const mediaDir = path.join(tempDir, 'media');
const persistentUploadDir = path.join(__dirname, '../../storage/uploads');

[tempDir, uploadDir, mediaDir, persistentUploadDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Konfigurasi multer untuk upload dari dashboard
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 16 * 1024 * 1024 } // 16 MB
});

// Konfigurasi multer untuk upload persisten (gambar auto-reply)
const persistentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, persistentUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadPersistent = multer({
    storage: persistentStorage,
    limits: { fileSize: 16 * 1024 * 1024 } // 16 MB
});

// Simpan media dari pesan masuk
const saveMediaTemporarily = async (media) => {
    const ext = media.mimetype.split('/')[1] || 'bin';
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const filePath = path.join(mediaDir, filename);
    fs.writeFileSync(filePath, media.data, 'base64');
    const publicUrl = `${process.env.PUBLIC_URL}/temp/media/${filename}`;
    return publicUrl;
};

// Hapus file yang lebih dari `hours` jam
const cleanOldFiles = (hours = 1) => {
    const now = Date.now();
    [uploadDir, mediaDir].forEach(dir => {
        fs.readdir(dir, (err, files) => {
            if (err) {
                logger.error('Error reading temp directory:', err);
                return;
            }
            files.forEach(file => {
                const filePath = path.join(dir, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) {
                        logger.error('Error stating file:', err);
                        return;
                    }
                    const age = now - stats.mtimeMs;
                    if (age > hours * 60 * 60 * 1000) {
                        fs.unlink(filePath, (err) => {
                            if (err) logger.error('Error deleting old file:', err);
                            else logger.debug(`Deleted old temp file: ${file}`);
                        });
                    }
                });
            });
        });
    });
};

// Jadwalkan pembersihan setiap jam
cron.schedule('0 * * * *', () => {
    logger.info('Running scheduled temp file cleanup');
    cleanOldFiles(1);
});

module.exports = { upload, uploadPersistent, saveMediaTemporarily, cleanOldFiles };
