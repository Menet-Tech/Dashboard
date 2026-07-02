const express = require('express');
const router = express.Router();
const { createRule, listRules, removeRule, patchRule } = require('../../controllers/autoreply.controller');
const { uploadPersistent } = require('../../utils/fileHandler');

/**
 * @swagger
 * /autoreply:
 *   post:
 *     summary: Tambah rule auto-reply baru
 *     tags: [AutoReply]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [keyword, reply]
 *             properties:
 *               keyword:
 *                 type: string
 *                 example: "harga"
 *               reply:
 *                 type: string
 *                 example: "Harga produk kami mulai dari Rp 50.000"
 *               matchType:
 *                 type: string
 *                 enum: [exact, contains, startsWith]
 *                 default: contains
 *     responses:
 *       200:
 *         description: Rule berhasil ditambahkan
 *   get:
 *     summary: Lihat semua rule auto-reply
 *     tags: [AutoReply]
 */
router.post('/', uploadPersistent.single('image'), createRule);
router.get('/', listRules);

/**
 * @swagger
 * /autoreply/{id}:
 *   delete:
 *     summary: Hapus rule auto-reply
 *     tags: [AutoReply]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *   patch:
 *     summary: Aktifkan atau nonaktifkan rule
 *     tags: [AutoReply]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 */
router.delete('/:id', removeRule);
router.patch('/:id', uploadPersistent.single('image'), patchRule);

module.exports = router;
