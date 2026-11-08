const express = require('express');
const db = require('../db');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { createChat } = require('../lib/chat-core');

const router = express.Router();
const chat = createChat(db);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const out = await chat.reply(req.user.id, req.body || {});
    if (out.status !== 200) return res.status(out.status).json({ error: out.error });
    const { status, ...rest } = out;
    res.json(rest);
  })
);

module.exports = router;
