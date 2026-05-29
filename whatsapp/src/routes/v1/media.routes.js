const express = require('express');
const router = express.Router();
const { sendMedia } = require('../../controllers/media.controller');
const { upload } = require('../../utils/fileHandler');

/**
 * @swagger
 * /media:
 *   post:
 *     summary: Mengirim file (gambar, video, dokumen, audio)
 *     tags: [Media]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - file
 *             properties:
 *               to:
 *                 type: string
 *               caption:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Berhasil mengirim media
 */
router.post('/', upload.single('file'), sendMedia);

module.exports = router;
