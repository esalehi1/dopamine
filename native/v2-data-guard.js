'use strict';
(function () {
  const originalMigrateDataV1 = migrateData;
  function ensureV2Shape(value) {
    const next = value && typeof value === 'object' ? value : {};
    next.version = 2;
    next.skips = next.skips && typeof next.skips === 'object' ? next.skips : {};
    next.tradingLessons = Array.isArray(next.tradingLessons) ? next.tradingLessons : [];
    next.lessonPopupSeen = next.lessonPopupSeen && typeof next.lessonPopupSeen === 'object' ? next.lessonPopupSeen : {};
    next.settings = { mondayLessonTime: '08:00', ...(next.settings || {}) };
    next.goals = Array.isArray(next.goals) ? next.goals : [];
    next.goals.forEach(goal => { if (!['high','medium','low'].includes(goal.importance)) goal.importance = 'medium'; });
    return next;
  }
  migrateData = function (raw) { return ensureV2Shape(originalMigrateDataV1(raw)); };
  data = ensureV2Shape(data);
  saveData();
})();
