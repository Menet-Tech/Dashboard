const express = require('express');
const router = express.Router();
const { registerWebhook, deleteWebhook, getWebhooks } = require('../../controllers/webhook.controller');

/**
 * @swagger
 * tags:
 *   name: Webhook
 *   description: Manajemen URL webhook penerima pesan masuk
 *
 * /webhook:
 *   post:
 *     summary: Daftarkan URL webhook baru
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 example: "https://myapp.com/whatsapp-hook"
 *     responses:
 *       200:
 *         description: Webhook berhasil didaftarkan
 *   get:
 *     summary: Lihat semua URL webhook yang terdaftar
 *     tags: [Webhook]
 *     responses:
 *       200:
 *         description: Array URL webhook
 *   delete:
 *     summary: Hapus URL webhook
 *     tags: [Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Webhook berhasil dihapus
 */
router.post('/', registerWebhook);
router.delete('/', deleteWebhook);
router.get('/', getWebhooks);

module.exports = router;
