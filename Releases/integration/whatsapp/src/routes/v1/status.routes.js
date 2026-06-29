const express = require('express');
const router = express.Router();
const { getStatus } = require('../../controllers/status.controller');

/**
 * @swagger
 * tags:
 *   name: Status
 *   description: Status koneksi WhatsApp
 *
 * /status:
 *   get:
 *     summary: Mendapatkan status koneksi dan info akun WhatsApp
 *     tags: [Status]
 *     responses:
 *       200:
 *         description: Status aktif
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     connected:
 *                       type: boolean
 *                     name:
 *                       type: string
 *                     number:
 *                       type: string
 *       503:
 *         description: WhatsApp belum siap
 */
router.get('/', getStatus);

module.exports = router;
