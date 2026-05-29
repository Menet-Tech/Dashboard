const express = require('express');
const router = express.Router();
const { scheduleMessage, listScheduled, cancelScheduled } = require('../../controllers/scheduled.controller');

/**
 * @swagger
 * /scheduled:
 *   post:
 *     summary: Jadwalkan pengiriman pesan teks
 *     tags: [Scheduled]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, text, scheduledAt]
 *             properties:
 *               to:
 *                 type: string
 *                 example: "6281234567890"
 *               text:
 *                 type: string
 *                 example: "Halo, ini pesan terjadwal!"
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-03-03T08:00:00"
 *     responses:
 *       200:
 *         description: Pesan berhasil dijadwalkan
 *   get:
 *     summary: Lihat semua pesan yang dijadwalkan
 *     tags: [Scheduled]
 *     responses:
 *       200:
 *         description: Daftar pesan terjadwal
 */
router.post('/', scheduleMessage);
router.get('/', listScheduled);

/**
 * @swagger
 * /scheduled/{id}:
 *   delete:
 *     summary: Batalkan pesan terjadwal
 *     tags: [Scheduled]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pesan berhasil dibatalkan
 */
router.delete('/:id', cancelScheduled);

module.exports = router;
