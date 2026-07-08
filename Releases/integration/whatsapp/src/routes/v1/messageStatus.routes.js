const express = require('express');
const router = express.Router();
const { listMessages, getStatus } = require('../../controllers/messageStatus.controller');

/**
 * @swagger
 * /messages/history:
 *   get:
 *     summary: Lihat history semua pesan terkirim
 *     tags: [Messages]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Jumlah pesan yang ditampilkan (default 100)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: Offset untuk paginasi
 *     responses:
 *       200:
 *         description: List history pesan
 */
router.get('/history', listMessages);

/**
 * @swagger
 * /messages/{id}/status:
 *   get:
 *     summary: Lihat status satu pesan berdasarkan ID
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detail pesan
 */
router.get('/:id/status', getStatus);

module.exports = router;
