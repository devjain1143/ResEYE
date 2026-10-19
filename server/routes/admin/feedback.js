import { Router } from 'express';
import { getUnratedAiQueries, getAiQueryById, rateAiQuery, addFeedbackCorrection } from '../../core/query.js';
import { parseCorrectionInput } from '../../nlq/feedbackParser.js';
import { audit } from '../../services/auditService.js';

const router = Router();

router.get('/next', async (req, res, next) => {
  try {
    const unrated = await getUnratedAiQueries(1, 1);
    if (!unrated.results || unrated.results.length === 0) {
      return res.json({ success: true, data: null, message: 'All queries triaged.' });
    }
    res.json({
      success: true,
      data: unrated.results[0],
      totalUnrated: unrated.total
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/rate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, correction } = req.body;

    if (!rating || !['good', 'bad'].includes(rating)) {
      return res.status(400).json({ success: false, message: "Rating must be 'good' or 'bad'." });
    }

    const aiQuery = await getAiQueryById(id);
    if (!aiQuery) {
      return res.status(404).json({ success: false, message: 'AI query not found.' });
    }

    let parsedCorrection = null;
    if (rating === 'bad' && correction) {
      const parseRes = await parseCorrectionInput(correction);
      if (!parseRes.success) {
        return res.status(400).json({ success: false, message: `Correction error: ${parseRes.error}` });
      }

      parsedCorrection = parseRes.intentJson;
      const wrongOutput = JSON.stringify({
        intent: aiQuery.intent,
        batch: aiQuery.batch,
        semester: aiQuery.semester,
        isAnswered: aiQuery.is_answered
      });

      await addFeedbackCorrection(aiQuery.query_text, wrongOutput, parsedCorrection, req.user.id);
    }

    await rateAiQuery(id, rating);
    await audit(req, 'FEEDBACK_RATE', id, { rating, hasCorrection: Boolean(parsedCorrection) });

    res.json({
      success: true,
      message: `Query marked ${rating}.${parsedCorrection ? ' Dynamic few-shot vector memory updated.' : ''}`
    });
  } catch (err) {
    next(err);
  }
});

export default router;
