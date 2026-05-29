const express = require('express');
const router = express.Router();

const statusRoutes = require('./status.routes');
const messagesRoutes = require('./messages.routes');
const messageStatusRoutes = require('./messageStatus.routes');
const mediaRoutes = require('./media.routes');
const groupsRoutes = require('./groups.routes');
const contactsRoutes = require('./contacts.routes');
const webhookRoutes = require('./webhook.routes');
const accountsRoutes = require('./accounts.routes');
const scheduledRoutes = require('./scheduled.routes');
const autoreplyRoutes = require('./autoreply.routes');
const aiRoutes = require('./ai.routes');
const chatbotRoutes = require('./chatbot.routes');

const { apiKeyAuth } = require('../../middleware/auth');
const { accountSelector } = require('../../middleware/accountSelector');
const { readinessMiddleware } = require('../../middleware/readiness');

// Gunakan API Key Auth dan Account Selector untuk semua rute v1
router.use(apiKeyAuth);
router.use(accountSelector);

// Rute yang TIDAK butuh aksi kirim pesan WA (bisa diakses sebelum ready)
router.use('/status', statusRoutes);
router.use('/accounts', accountsRoutes);
router.use('/webhook', webhookRoutes);
router.use('/ai', aiRoutes);
router.use('/autoreply', autoreplyRoutes);
router.use('/chatbot', chatbotRoutes);

// Endpoint status ringkas untuk Go backend integration check
const { getStatus } = require('../../controllers/accounts.controller');
router.get('/status', getStatus);

// Terapkan readinessMiddleware hanya untuk rute yang butuh WA client
router.use(readinessMiddleware);

router.use('/messages', messageStatusRoutes); // /messages/history dan /:id/status harus sebelum messages utama
router.use('/messages', messagesRoutes);
router.use('/media', mediaRoutes);
router.use('/groups', groupsRoutes);
router.use('/contacts', contactsRoutes);
router.use('/scheduled', scheduledRoutes);

module.exports = router;
