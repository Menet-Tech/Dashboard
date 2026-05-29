const express = require('express');
const router = express.Router();
const { sendMessage, reactMessage, sendInteractiveMessage } = require('../../controllers/messages.controller');
const { validate, sendMessageSchema } = require('../../middleware/validator');

/**
 * @swagger
 * tags:
 *   name: Messages
 *   description: Pengiriman pesan teks dan query history
 *
 * /messages:
 *   post:
 *     summary: Kirim pesan teks ke nomor WhatsApp
 *     tags: [Messages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, text]
 *             properties:
 *               to:
 *                 type: string
 *                 description: Nomor tujuan (format 62xxx atau 0xxx)
 *                 example: "6281234567890"
 *               text:
 *                 type: string
 *                 example: "Halo, ini pesan dari Gateway!"
 *               quotedMessageId:
 *                 type: string
 *                 description: ID pesan yang ingin di-quote (opsional)
 *     responses:
 *       200:
 *         description: Pesan berhasil dikirim
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 id:
 *                   type: string
 *       400:
 *         description: Validasi gagal (field wajib tidak ada)
 *       503:
 *         description: WhatsApp belum siap
 *
 * /messages/{id}/react:
 *   post:
 *     summary: Tambahkan reaksi emoji ke pesan
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID pesan yang ingin direaksi
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [emoji]
 *             properties:
 *               emoji:
 *                 type: string
 *                 example: "👍"
 *       200:
 *         description: Reaksi berhasil ditambahkan
 * 
 * /messages/interactive:
 *   post:
 *     summary: Kirim pesan interaktif (Button / List)
 *     tags: [Messages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, type, body]
 *             properties:
 *               to:
 *                 type: string
 *               type:
 *                 type: string
 *                 description: enum "button" atau "list"
 *                 example: "button"
 *               body:
 *                 type: string
 *                 description: Pesan utama
 *               title:
 *                 type: string
 *               footer:
 *                 type: string
 *               buttons:
 *                 type: array
 *                 description: "(Hanya untuk type=button) Format [{body: 'Tombol 1'}]"
 *                 items:
 *                   type: object
 *               buttonText:
 *                 type: string
 *                 description: "(Hanya untuk type=list) Teks di tombol menu utama"
 *               sections:
 *                 type: array
 *                 description: "(Hanya untuk type=list)"
 *     responses:
 *       200:
 *         description: Interactive message sent
 */
router.post('/', validate(sendMessageSchema), sendMessage);
router.post('/interactive', sendInteractiveMessage);
router.post('/:id/react', reactMessage);

module.exports = router;
