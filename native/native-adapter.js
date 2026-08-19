import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const DATA_KEY = 'dopamine-reset-data-v1';
const IDS_KEY = 'dopamine-native-reminder-ids-v1';
const LOOKAHEAD_DAYS = 30;
const MAX_REMINDERS = 220;
const FOCUS_TIMER_ID = 2_000_001;
const URGE_TIMER_ID = 2_000_002;
const isNative = Capacitor.isNativePlatform();
let syncTimer = null;

const pad = value => String(value).padStart(2, '0');
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
function parseDateKey(value) { const [y,m,d] = String(value||'').split('-').map(Number); return new Date(y,m-1,d); }
function addDays(date, days) { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate()+days); return d; }
function mondayStart(date) { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d; }
function previousTradingWeekKey(date) { return dateKey(addDays(mondayStart(date), -7)); }
function stableId(seed) { let hash=0; for(let i=0;i<seed.length;i+=1) hash=((hash<<5)-hash+seed.charCodeAt(i))|0; return 10_000+(hash&0x3fffffff); }
function validTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||'')); }
function atTime(date,value) { const [h,m]=value.split(':').map(Number); return new Date(date.getFullYear(),date.getMonth(),date.getDate(),h,m,0,0); }
function completionKey(goalId, dayKey) { return `${goalId}::${dayKey}`; }

function scheduledForDate(data, goal, date) {
  if (!goal?.active || goal?.archived) return false;
  const current = new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const createdAt = parseDateKey(goal.createdAt || dateKey(new Date()));
  const created = new Date(createdAt.getFullYear(),createdAt.getMonth(),createdAt.getDate());
  if (current < created) return false;
  if (data.skips?.[completionKey(goal.id,dateKey(date))]) return false;
  const schedule=goal.schedule||{type:'daily'};
  if(schedule.type==='daily') return true;
  if(schedule.type==='once') return schedule.date===dateKey(date);
  if(schedule.type==='weekdays') return (schedule.days||[]).map(Number).includes(date.getDay());
  if(schedule.type==='weekly') {
    const preferred=[6,1,3,5,0,2,4];
    const count=Math.max(1,Math.min(7,Number(schedule.count||1)));
    return preferred.slice(0,count).includes(date.getDay());
  }
  return true;
}
function completionExists(data, goalId, dayKey) { return Boolean(data.completions?.[completionKey(goalId,dayKey)]?.completed); }
function lessonForWeek(data, weekKey) { return (data.tradingLessons||[]).find(item=>item.weekKey===weekKey && item.text?.trim()) || null; }

function readTrackedIds() { try { const parsed=JSON.parse(localStorage.getItem(IDS_KEY)||'[]'); return Array.isArray(parsed)?parsed.filter(Number.isInteger):[]; } catch { return []; } }
async function cancelIds(ids) { if(ids.length) await LocalNotifications.cancel({notifications:ids.map(id=>({id}))}); }
async function hasNotificationPermission() { const permission=await LocalNotifications.checkPermissions(); return permission.display==='granted'; }

async function syncReminders(rawData) {
  if(!isNative || !(await hasNotificationPermission())) return;
  let data;
  try { data=typeof rawData==='string'?JSON.parse(rawData):rawData; } catch { return; }
  if(!data || !Array.isArray(data.goals)) return;

  await cancelIds(readTrackedIds());
  const notifications=[];
  const now=Date.now();
  const start=new Date(); start.setHours(12,0,0,0);

  for(let offset=0; offset<LOOKAHEAD_DAYS && notifications.length<MAX_REMINDERS; offset+=1) {
    const day=addDays(start,offset);
    const dayKeyValue=dateKey(day);
    for(const goal of data.goals) {
      if(notifications.length>=MAX_REMINDERS) break;
      if(!validTime(goal.reminderTime) || !scheduledForDate(data,goal,day)) continue;
      if(completionExists(data,goal.id,dayKeyValue)) continue;
      const fireAt=atTime(day,goal.reminderTime);
      if(fireAt.getTime()<=now+5000) continue;
      notifications.push({
        id:stableId(`goal|${goal.id}|${dayKeyValue}|${goal.reminderTime}`),
        title:'یادآوری هدف', body:goal.title||'یک قدم کوچک برای امروز',
        schedule:{at:fireAt,allowWhileIdle:true}, autoCancel:true,
        extra:{kind:'goal',goalId:goal.id,dayKey:dayKeyValue}
      });
    }

    const nightTime=data.settings?.nightReminderTime||'22:00';
    if(notifications.length<MAX_REMINDERS && validTime(nightTime) && !data.reflections?.[dayKeyValue]) {
      const fireAt=atTime(day,nightTime);
      if(fireAt.getTime()>now+5000) notifications.push({
        id:stableId(`night|${dayKeyValue}|${nightTime}`), title:'مرور شبانه',
        body:'یک دقیقه برای ثبت برد امروز و اولویت فردا.', schedule:{at:fireAt,allowWhileIdle:true},
        autoCancel:true, extra:{kind:'night',dayKey:dayKeyValue}
      });
    }

    if(day.getDay()===1 && notifications.length<MAX_REMINDERS) {
      const mondayTime=data.settings?.mondayLessonTime||'08:00';
      const lesson=lessonForWeek(data,previousTradingWeekKey(day));
      if(lesson && validTime(mondayTime)) {
        const fireAt=atTime(day,mondayTime);
        if(fireAt.getTime()>now+5000) notifications.push({
          id:stableId(`trading-lesson|${dayKeyValue}|${mondayTime}`),
          title:'درس معاملات هفته گذشته',
          body:'قبل از شروع هفته جدید، درس‌ها و اشتباه‌های هفته گذشته را مرور کن.',
          schedule:{at:fireAt,allowWhileIdle:true}, autoCancel:true,
          extra:{kind:'tradingLesson',dayKey:dayKeyValue,weekKey:previousTradingWeekKey(day)}
        });
      }
    }
  }

  if(notifications.length) await LocalNotifications.schedule({notifications});
  localStorage.setItem(IDS_KEY,JSON.stringify(notifications.map(({id})=>id)));
}
function queueReminderSync(rawData=localStorage.getItem(DATA_KEY)) { if(!isNative||!rawData)return; clearTimeout(syncTimer); syncTimer=setTimeout(()=>syncReminders(rawData).catch(console.error),400); }

async function requestNotificationAccess() {
  let permission=await LocalNotifications.checkPermissions();
  if(permission.display!=='granted') permission=await LocalNotifications.requestPermissions();
  if(permission.display!=='granted') { showToast('اجازه اعلان داده نشد؛ از تنظیمات گوشی می‌توانی فعالش کنی'); return; }
  if(Capacitor.getPlatform()==='android') {
    const exact=await LocalNotifications.checkExactNotificationSetting();
    if(exact.exact_alarm!=='granted' && window.confirm('برای اجرای دقیق یادآورها در ساعت انتخابی، دسترسی «هشدار و یادآوری» را فعال می‌کنی؟')) await LocalNotifications.changeExactNotificationSetting();
  }
  await syncReminders(localStorage.getItem(DATA_KEY));
  await LocalNotifications.schedule({notifications:[{id:stableId(`enabled|${Date.now()}`),title:'یادآوری‌های ریست فعال شد',body:'یادآورها حتی وقتی برنامه بسته است اجرا می‌شوند.',schedule:{at:new Date(Date.now()+1200)},autoCancel:true}]});
  showToast('اعلان‌ها فعال شد');
}
function parseClock(elementId) { const text=document.getElementById(elementId)?.textContent||'00:00'; const normalized=text.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); const [m,s]=normalized.split(':').map(Number); return Math.max(1,(m||0)*60+(s||0)); }
async function scheduleTimer(id,title,body,delaySeconds,kind) { if(!isNative||!(await hasNotificationPermission()))return; await cancelIds([id]); await LocalNotifications.schedule({notifications:[{id,title,body,schedule:{at:new Date(Date.now()+delaySeconds*1000),allowWhileIdle:true},autoCancel:true,extra:{kind}}]}); }
function showToast(message) { const toast=document.getElementById('toast'); if(!toast)return; toast.textContent=message; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),2500); }

if(isNative) {
  const originalSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function patchedSetItem(key,value){ originalSetItem.call(this,key,value); if(this===localStorage&&key===DATA_KEY) queueReminderSync(value); };
  document.addEventListener('click',event=>{
    const target=event.target.closest('button'); if(!target)return;
    if(target.id==='notificationBtn') { event.preventDefault(); event.stopPropagation(); requestNotificationAccess().catch(error=>{console.error(error);showToast('فعال‌سازی اعلان ناموفق بود');}); return; }
    if(target.id==='focusStartBtn') { const wasRunning=target.textContent.trim()==='توقف'; const seconds=parseClock('focusTimer'); setTimeout(()=>{ if(wasRunning) cancelIds([FOCUS_TIMER_ID]).catch(console.error); else scheduleTimer(FOCUS_TIMER_ID,'جلسه تمرکز تمام شد','آفرین؛ چند نفس عمیق بکش و نتیجه را ثبت کن.',seconds,'focus').catch(console.error); },0); }
    if(target.id==='focusResetBtn'||target.matches('.timer-presets button')) cancelIds([FOCUS_TIMER_ID]).catch(console.error);
    if(target.id==='urgeTimerBtn') { const wasRunning=target.textContent.trim()==='توقف'; const seconds=parseClock('urgeTimer'); setTimeout(()=>{ if(wasRunning) cancelIds([URGE_TIMER_ID]).catch(console.error); else scheduleTimer(URGE_TIMER_ID,'۱۰ دقیقه گذشت','میل اولیه احتمالاً ضعیف‌تر شده؛ حالا آگاهانه تصمیم بگیر.',seconds,'urge').catch(console.error); },0); }
  },true);
  document.addEventListener('DOMContentLoaded',()=>{ hasNotificationPermission().then(granted=>{if(granted)queueReminderSync();}).catch(console.error); });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queueReminderSync();});
}
