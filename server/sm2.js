/**
 * SM-2 Spaced Repetition Scheduler for LuminaRead
 * Quality scores:
 *   1 = Again (重来 / 没记住)
 *   3 = Hard  (模糊 / 有点印象)
 *   4 = Good  (认识 / 正常回忆)
 *   5 = Easy  (秒记 / 非常熟练)
 */

export function calculateSm2(item, quality, now = new Date()) {
  const q = Number(quality);
  const validQ = [1, 2, 3, 4, 5].includes(q) ? q : 4;

  const prevEase = Number(item?.ease_factor ?? 2.5);
  const prevInterval = Number(item?.interval_days ?? 0);
  const prevReps = Number(item?.repetitions ?? 0);

  let easeFactor =
    prevEase + (0.1 - (5 - validQ) * (0.08 + (5 - validQ) * 0.02));
  easeFactor = Math.max(1.3, Math.round(easeFactor * 100) / 100);

  let repetitions = prevReps;
  let intervalDays = prevInterval;
  let nextReviewDate;

  if (validQ < 3) {
    repetitions = 0;
    intervalDays = 0;
    // Schedule 10 minutes later for quick re-testing without breaking due count
    nextReviewDate = new Date(now.getTime() + 10 * 60 * 1000);
  } else {
    repetitions = prevReps + 1;
    if (repetitions === 1) {
      intervalDays = validQ === 5 ? 3 : 1;
    } else if (repetitions === 2) {
      intervalDays = validQ === 3 ? 4 : validQ === 5 ? 8 : 6;
    } else {
      const multiplier = validQ === 3 ? 0.8 : validQ === 5 ? 1.3 : 1.0;
      intervalDays = Math.max(1, Math.round(prevInterval * easeFactor * multiplier));
    }
    nextReviewDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  }

  return {
    ease_factor: easeFactor,
    interval_days: intervalDays,
    repetitions,
    next_review_at: nextReviewDate.toISOString(),
    last_reviewed_at: now.toISOString(),
  };
}

export function previewNextIntervals(item) {
  const qualities = [
    { quality: 1, key: 'again', label: '重来' },
    { quality: 3, key: 'hard', label: '模糊' },
    { quality: 4, key: 'good', label: '认识' },
    { quality: 5, key: 'easy', label: '秒记' },
  ];

  return qualities.map((opt) => {
    const res = calculateSm2(item, opt.quality);
    let hint = '';
    if (opt.quality < 3) {
      hint = '10分钟后';
    } else if (res.interval_days === 1) {
      hint = '1天后';
    } else {
      hint = `${res.interval_days}天后`;
    }
    return {
      ...opt,
      interval_days: res.interval_days,
      hint,
    };
  });
}
