'use strict';

/* Dopamine Reset v2 extension. Keeps STORAGE_KEY and all v1 data intact. */
(function () {
  const V2_DAY_MS = 86400000;
  const v2AddDays = (date, days) => { const d = startOfDay(date); d.setDate(d.getDate() + days); return d; };
  const v2MondayStart = (date = new Date()) => { const d = startOfDay(date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
  const tradingWeekKey = (date = new Date()) => dateKey(v2MondayStart(date));
  const previousTradingWeekKey = (date = new Date()) => dateKey(v2AddDays(v2MondayStart(date), -7));
  const completionKeyV2 = (goalId, dayKey) => `${goalId}::${dayKey}`;

  data.version = 2;
  data.skips = data.skips && typeof data.skips === 'object' ? data.skips : {};
  data.tradingLessons = Array.isArray(data.tradingLessons) ? data.tradingLessons : [];
  data.lessonPopupSeen = data.lessonPopupSeen && typeof data.lessonPopupSeen === 'object' ? data.lessonPopupSeen : {};
  data.settings = { mondayLessonTime: '08:00', ...data.settings };
  data.goals.forEach(goal => { if (!['high','medium','low'].includes(goal.importance)) goal.importance = 'medium'; });
  saveData();

  const originalScheduled = isGoalScheduledForDate;
  isGoalScheduledForDate = function (goal, date) {
    if (data.skips?.[completionKeyV2(goal.id, dateKey(date))]) return false;
    return originalScheduled(goal, date);
  };

  function latestLesson(weekKey) {
    return data.tradingLessons.find(item => item.weekKey === weekKey) || null;
  }
  function importanceClass(goal) { return ['high','medium','low'].includes(goal.importance) ? goal.importance : 'medium'; }
  function importanceText(goal) { return ({high:'زیاد', medium:'متوسط', low:'کم'})[importanceClass(goal)]; }
  function consecutiveMisses(goal) {
    let misses = 0;
    let cursor = v2AddDays(new Date(), -1);
    for (let i = 0; i < 3650; i += 1) {
      const key = dateKey(cursor);
      if (!isGoalScheduledForDate(goal, cursor)) { cursor = v2AddDays(cursor, -1); continue; }
      if (isCompleted(goal.id, key)) break;
      misses += 1;
      cursor = v2AddDays(cursor, -1);
    }
    return misses;
  }
  function missCount30(goal) {
    let misses = 0;
    const end = startOfDay(new Date());
    const start = v2AddDays(end, -29);
    for (let cursor = start; cursor <= end; cursor = v2AddDays(cursor, 1)) {
      if (isGoalScheduledForDate(goal, cursor) && !isCompleted(goal.id, dateKey(cursor))) misses += 1;
    }
    return misses;
  }
  function bestGoalStreakV2(goal) {
    const created = parseDateKey(goal.createdAt || getTodayKey());
    let best = 0, current = 0;
    for (let cursor = startOfDay(created); cursor <= startOfDay(new Date()); cursor = v2AddDays(cursor, 1)) {
      if (!isGoalScheduledForDate(goal, cursor)) continue;
      if (isCompleted(goal.id, dateKey(cursor))) { current += 1; best = Math.max(best, current); }
      else current = 0;
    }
    return best;
  }

  function injectUI() {
    if (!document.getElementById('quitHabitsList')) {
      const goalsList = document.getElementById('goalsList');
      goalsList?.insertAdjacentHTML('beforebegin', `
        <section class="section-block quit-habits-section">
          <div class="section-heading"><div><h2>ترک عادت</h2><p>رکورد فعلی و بهترین رکورد دوری از عادت‌های محرک.</p></div></div>
          <div id="quitHabitsList" class="quit-habits-list"></div>
        </section>`);
    }
    if (!document.getElementById('missedTasks30List')) {
      const chartSection = document.getElementById('progressChart')?.closest('.section-block');
      chartSection?.insertAdjacentHTML('beforebegin', `
        <section class="section-block">
          <div class="section-heading"><div><h2>انجام‌نشده‌های ۳۰ روز گذشته</h2><p>موارد برنامه‌ریزی‌شده‌ای که انجام نشدند، از بیشترین به کمترین.</p></div></div>
          <div id="missedTasks30List" class="missed-tasks-list"></div>
        </section>`);
    }
    if (!document.getElementById('tradingLessonInput')) {
      const avoidance = document.getElementById('avoidanceQuickList')?.closest('.section-block');
      avoidance?.insertAdjacentHTML('beforebegin', `
        <section class="section-block trading-lessons-block">
          <div class="section-heading"><div><h2>درس معاملات هفته گذشته</h2><p>هفته قبل را مرور کن و نکته‌های این هفته را برای دوشنبه آینده ثبت کن.</p></div></div>
          <div id="previousTradingLesson" class="trading-lesson-preview"></div>
          <label class="field-label" for="tradingLessonInput">درس‌ها و اشتباه‌های این هفته</label>
          <textarea class="textarea-input" id="tradingLessonInput" maxlength="1200" placeholder="مثلاً: بعد از دو ضرر پشت سر هم وارد معامله سوم نشوم؛ قبل ورود نسبت ریسک به بازده را دوباره چک کنم."></textarea>
          <button class="secondary-button" id="saveTradingLessonBtn">ذخیره برای مرور دوشنبه</button>
        </section>`);
    }
    if (!document.getElementById('goalImportance')) {
      const difficulty = document.getElementById('goalDifficulty')?.closest('label');
      difficulty?.insertAdjacentHTML('afterend', `<label><span>اهمیت</span><select class="select-input" id="goalImportance"><option value="high">زیاد — قرمز</option><option value="medium" selected>متوسط — زرد</option><option value="low">کم — سبز</option></select></label>`);
    }
    if (!document.getElementById('mondayLessonTime')) {
      const gentle = document.getElementById('gentleModeToggle')?.closest('.setting-row');
      gentle?.insertAdjacentHTML('beforebegin', `<label class="setting-row"><span><strong>مرور درس معاملات دوشنبه</strong><small>اعلان و پاپ‌آپ درس‌های هفته گذشته</small></span><input type="time" id="mondayLessonTime" value="08:00" /></label>`);
    }
    if (!document.getElementById('taskActionModal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-backdrop" id="taskActionModal" hidden><section class="modal-sheet small-sheet" role="dialog" aria-modal="true">
          <div class="modal-header"><div><span class="soft-badge">تسک</span><h2 id="taskActionTitle"></h2></div><button class="icon-button" data-close-modal="taskActionModal">×</button></div>
          <input type="hidden" id="taskActionGoalId"><p class="helper-text" id="taskActionHint"></p>
          <div class="form-actions"><button class="secondary-button" data-close-modal="taskActionModal">بستن</button><button class="primary-button" id="moveTaskTomorrowBtn">انتقال به روز بعد</button></div>
        </section></div>
        <div class="modal-backdrop" id="mondayLessonModal" hidden><section class="modal-sheet small-sheet lesson-modal" role="dialog" aria-modal="true">
          <div class="modal-header"><div><span class="soft-badge">شروع هفته جدید</span><h2>درس معاملات هفته گذشته</h2></div></div>
          <div id="mondayLessonText" class="monday-lesson-text"></div><p class="helper-text">قبل از اولین تصمیم معاملاتی هفته، این نکات را یک بار کامل بخوان.</p>
          <button class="primary-button full-width" id="markMondayLessonReadBtn">خواندم و یادم ماند</button>
        </section></div>`);
    }
  }
  injectUI();

  const originalRenderToday = renderToday;
  renderToday = function () {
    originalRenderToday();
    document.querySelectorAll('#todayTasks .task-card').forEach(card => {
      const goalId = card.querySelector('[data-toggle-goal]')?.dataset.toggleGoal;
      const goal = data.goals.find(item => item.id === goalId);
      if (!goal) return;
      card.classList.add(`importance-${importanceClass(goal)}`);
      card.dataset.taskMenu = goal.id;
      const misses = consecutiveMisses(goal);
      if (misses >= 3 && !isCompleted(goal.id, getTodayKey())) {
        card.classList.add('repeatedly-missed');
        const meta = card.querySelector('.task-meta');
        if (meta && !meta.querySelector('.miss-warning')) meta.insertAdjacentHTML('beforeend', `<span class="miss-warning">${toFa(misses)} بار پیاپی انجام نشده</span>`);
      }
    });
  };

  const originalRenderGoals = renderGoals;
  renderGoals = function () {
    originalRenderGoals();
    document.querySelectorAll('#goalsList .goal-card').forEach(card => {
      const goalId = card.querySelector('[data-edit-goal]')?.dataset.editGoal;
      const goal = data.goals.find(item => item.id === goalId);
      if (!goal) return;
      card.classList.add(`importance-${importanceClass(goal)}`);
      const row = card.querySelector('.goal-meta-row');
      if (row && !row.querySelector('.importance-meta')) row.insertAdjacentHTML('beforeend', `<span class="importance-meta">اهمیت ${importanceText(goal)}</span>`);
    });
  };

  function renderQuitHabitsV2() {
    const list = document.getElementById('quitHabitsList');
    if (!list) return;
    const habits = data.goals.filter(goal => goal.type === 'avoid' && goal.active && !goal.archived);
    if (!habits.length) { list.innerHTML = '<div class="empty-state"><p>هنوز موردی برای ترک عادت تعریف نشده. یک هدف از نوع «کاهش محرک» بساز.</p></div>'; return; }
    list.innerHTML = habits.map(goal => {
      const slips = data.urges.filter(item => item.goalId === goal.id && item.outcome === 'slip').length;
      return `<article class="quit-card importance-${importanceClass(goal)}"><div><strong>${escapeHTML(goal.title)}</strong><p>${escapeHTML(goal.note || 'هر روز پاک، یک قدم جلوتر.')}</p></div><div class="record-grid"><span><b>${toFa(goalStreak(goal))}</b><small>رکورد فعلی</small></span><span><b>${toFa(bestGoalStreakV2(goal))}</b><small>بهترین رکورد</small></span><span><b>${toFa(slips)}</b><small>لغزش ثبت‌شده</small></span></div><button class="secondary-button small" data-v2-clean-day="${goal.id}">${isCompleted(goal.id,getTodayKey()) ? 'امروز ثبت شده ✓' : 'ثبت روز پاک امروز'}</button></article>`;
    }).join('');
  }
  function renderMissedTasksV2() {
    const list = document.getElementById('missedTasks30List');
    if (!list) return;
    const rows = data.goals.filter(goal => !goal.archived).map(goal => ({goal, misses: missCount30(goal)})).filter(item => item.misses > 0).sort((a,b) => b.misses-a.misses);
    list.innerHTML = rows.length ? rows.map(({goal,misses}) => `<div class="missed-row"><div><strong>${escapeHTML(goal.title)}</strong><small>${typeText(goal.type)}</small></div><b>${toFa(misses)} بار انجام نشده</b></div>`).join('') : '<div class="empty-state"><p>در ۳۰ روز گذشته مورد انجام‌نشده‌ای ثبت نشده.</p></div>';
  }
  function renderTradingLessonsV2() {
    const previous = latestLesson(previousTradingWeekKey());
    const current = latestLesson(tradingWeekKey());
    const preview = document.getElementById('previousTradingLesson');
    const input = document.getElementById('tradingLessonInput');
    if (preview) preview.innerHTML = previous?.text ? `<strong>درس هفته گذشته</strong><p>${escapeHTML(previous.text).replace(/\n/g,'<br>')}</p>` : '<p class="helper-text">برای هفته گذشته درسی ثبت نشده است.</p>';
    if (input && document.activeElement !== input) input.value = current?.text || '';
  }
  const originalRenderAll = renderAll;
  renderAll = function () { originalRenderAll(); renderQuitHabitsV2(); renderMissedTasksV2(); renderTradingLessonsV2(); };

  const originalRenderSettings = renderSettings;
  renderSettings = function () {
    originalRenderSettings();
    const monday = document.getElementById('mondayLessonTime');
    if (monday) monday.value = data.settings.mondayLessonTime || '08:00';
  };

  const originalResetGoalForm = resetGoalForm;
  resetGoalForm = function () { originalResetGoalForm(); const field=document.getElementById('goalImportance'); if(field) field.value='medium'; };
  const originalEditGoal = editGoal;
  editGoal = function (goalId) { originalEditGoal(goalId); const goal=data.goals.find(item=>item.id===goalId); const field=document.getElementById('goalImportance'); if(field&&goal) field.value=goal.importance||'medium'; };

  submitGoal = function (event) {
    event.preventDefault();
    const id = el('goalId').value;
    const scheduleType = el('goalScheduleType').value;
    const schedule = { type: scheduleType };
    if (scheduleType === 'weekdays') schedule.days = qsa('#weekdayPicker input:checked').map(input => Number(input.value));
    if (scheduleType === 'weekly') schedule.count = Number(el('goalWeeklyCount').value || 1);
    if (scheduleType === 'once') schedule.date = el('goalSpecificDate').value;
    if (scheduleType === 'weekdays' && !schedule.days.length) return showToast('حداقل یک روز هفته انتخاب کن');
    if (scheduleType === 'once' && !schedule.date) return showToast('تاریخ انجام را انتخاب کن');
    const payload = { title: el('goalTitle').value.trim(), type: el('goalType').value, difficulty: Number(el('goalDifficulty').value), importance: el('goalImportance')?.value || 'medium', category: el('goalCategory').value, schedule, reminderTime: el('goalReminderTime').value, duration: el('goalDuration').value ? Number(el('goalDuration').value) : null, note: el('goalNote').value.trim(), active: true, archived: false };
    if (!payload.title) return;
    if (id) Object.assign(data.goals.find(goal => goal.id === id), payload);
    else data.goals.unshift({ id: uid(), ...payload, createdAt: getTodayKey() });
    saveData(); closeModal('goalModal'); renderAll(); showToast(id ? 'هدف ویرایش شد' : 'هدف جدید ساخته شد');
  };

  function saveTradingLessonV2() {
    const input = document.getElementById('tradingLessonInput');
    const text = input?.value.trim();
    if (!text) return showToast('اول درس یا نکته هفته را بنویس');
    const weekKey = tradingWeekKey();
    const existing = latestLesson(weekKey);
    if (existing) { existing.text = text; existing.updatedAt = new Date().toISOString(); }
    else data.tradingLessons.push({id:uid(),weekKey,text,createdAt:new Date().toISOString()});
    saveData(); renderTradingLessonsV2(); showToast('درس معاملات ذخیره شد؛ دوشنبه آینده یادآوری می‌شود');
  }
  function openTaskMenu(goalId) {
    const goal=data.goals.find(item=>item.id===goalId); if(!goal)return;
    el('taskActionGoalId').value=goalId; el('taskActionTitle').textContent=goal.title;
    el('moveTaskTomorrowBtn').hidden=goal.type!=='task';
    el('taskActionHint').textContent=goal.type==='task'?'این تسک با همان مشخصات به فردا منتقل می‌شود.':'انتقال به فردا فقط برای «کار مشخص» فعال است.';
    openModal('taskActionModal');
  }
  function moveTaskTomorrowV2() {
    const goal=data.goals.find(item=>item.id===el('taskActionGoalId').value); if(!goal||goal.type!=='task')return;
    const today=getTodayKey(), tomorrow=dateKey(v2AddDays(new Date(),1));
    if(goal.schedule?.type==='once') goal.schedule.date=tomorrow;
    else {
      data.skips[completionKeyV2(goal.id,today)]={reason:'moved',movedTo:tomorrow,createdAt:new Date().toISOString()};
      data.goals.unshift({...clone(goal),id:uid(),schedule:{type:'once',date:tomorrow},createdAt:tomorrow,parentGoalId:goal.id,active:true,archived:false});
    }
    saveData(); closeModal('taskActionModal'); renderAll(); showToast('تسک با همان مشخصات به فردا منتقل شد');
  }
  function maybeMondayPopupV2() {
    const now=new Date(); if(now.getDay()!==1||now.getHours()<6)return;
    const week=tradingWeekKey(now); if(data.lessonPopupSeen[week])return;
    const lesson=latestLesson(previousTradingWeekKey(now)); if(!lesson?.text)return;
    el('mondayLessonText').innerHTML=escapeHTML(lesson.text).replace(/\n/g,'<br>'); openModal('mondayLessonModal');
  }
  function markLessonReadV2() { data.lessonPopupSeen[tradingWeekKey()]=new Date().toISOString(); saveData(); closeModal('mondayLessonModal'); showToast('درس هفته گذشته خوانده شد'); }

  const originalCheckReminders = checkInAppReminders;
  checkInAppReminders = function () {
    originalCheckReminders();
    const now=new Date(), current=`${pad(now.getHours())}:${pad(now.getMinutes())}`, key=getTodayKey();
    if(now.getDay()===1 && current===(data.settings.mondayLessonTime||'08:00') && !sessionStorage.getItem(`trade-lesson::${key}`)) {
      const lesson=latestLesson(previousTradingWeekKey(now));
      if(lesson?.text){sessionStorage.setItem(`trade-lesson::${key}`,'1');notify('درس معاملات هفته گذشته','قبل از شروع هفته جدید، درس‌های هفته گذشته را مرور کن.');maybeMondayPopupV2();}
    }
  };

  document.addEventListener('click', event => {
    const clean=event.target.closest('[data-v2-clean-day]'); if(clean){toggleCompletion(clean.dataset.v2CleanDay);return;}
    const card=event.target.closest('#todayTasks .task-card');
    if(card && !event.target.closest('.check-button') && !event.target.closest('.points-pill')) { const id=card.dataset.taskMenu; if(id)openTaskMenu(id); return; }
  });
  document.getElementById('saveTradingLessonBtn')?.addEventListener('click',saveTradingLessonV2);
  document.getElementById('moveTaskTomorrowBtn')?.addEventListener('click',moveTaskTomorrowV2);
  document.getElementById('markMondayLessonReadBtn')?.addEventListener('click',markLessonReadV2);
  document.getElementById('mondayLessonTime')?.addEventListener('change',event=>{data.settings.mondayLessonTime=event.target.value;saveData();showToast('زمان مرور دوشنبه ذخیره شد');});

  maybeMondayPopupV2();
})();
