const express = require('express');
const router = express.Router();
const { getAiSettings, updateAiSettings } = require('../../controllers/ai.controller');

/**
 * @swagger
 * /ai:
 *   get:
 *     summary: Dapatkan pengaturan AI untuk akun yang aktif (berdasarkan x-account-id)
 *     tags: [AI]
 *     responses:
 *       200:
 *         description: Berhasil memuat data
 *   put:
 *     summary: Perbarui pengaturan AI (aktifkan/nonaktifkan dan atur prompt)
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 example: true
 *               systemPrompt:
 *                 type: string
 *                 example: "Kamu adalah asisten customer service ramah."
 *               aiProvider:
 *                 type: string
 *                 example: "custom"
 *               aiBaseUrl:
 *                 type: string
 *                 example: "http://localhost:11434/v1"
 *               aiApiKey:
 *                 type: string
 *                 example: "ollama"
 *               aiModel:
 *                 type: string
 *                 example: "llama3"
 *     responses:
 *       200:
 *         description: Berhasil diupdate
 */
router.get('/', getAiSettings);
router.put('/', updateAiSettings);

module.exports = router;
