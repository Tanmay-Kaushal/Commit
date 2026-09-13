const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getEventsForPact } = require('../events');

const router = express.Router();
router.use(requireAuth);

router.get('/:pactId', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const isParticipant = pact.creator_id === req.user.id || pact.partner_id === req.user.id;
  if (!isParticipant) return res.status(403).json({ error: 'Not a participant in this pact' });

  res.json(getEventsForPact(pact.id));
});

module.exports = router;
