const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getEventsForPact } = require('../events');

const router = express.Router();
router.use(requireAuth);

router.get('/:pactId', (req, res) => {
  const pact = db.prepare('SELECT * FROM habit_pacts WHERE id = ?').get(req.params.pactId);
  if (!pact) return res.status(404).json({ error: 'Pact not found' });

  const isParticipant = db.prepare(`
    SELECT 1 FROM pact_participants WHERE pact_id = ? AND (user_id = ? OR email = ?)
  `).get(pact.id, req.user.id, req.user.email);
  if (!isParticipant) return res.status(403).json({ error: 'Not a participant in this pact' });

  res.json(getEventsForPact(pact.id));
});

module.exports = router;
