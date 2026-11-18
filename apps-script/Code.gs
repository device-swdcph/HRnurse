/**
 * Export ข้อมูลกำลังคนจาก Supabase (HR nurse SWD) → Google Sheets เป็นรอบ
 *
 * ตั้งค่าครั้งแรก:
 *   1) ตั้งค่าโปรเจกต์ (รูปเฟือง) → Script Properties → เพิ่ม 3 ค่า
 *        SUPABASE_ANON_KEY = anon / publishable key  (ห้ามใช้ service_role)
 *        SB_EMAIL          = อีเมลบัญชีที่ใช้ดึงข้อมูล
 *        SB_PASSWORD       = รหัสผ่านบัญชีนั้น
 *      บัญชีนี้ต้องมีแถวใน profiles ที่ role ≠ 'none' และ unit = '*' ถึงจะเห็นทุกหน่วยงาน
 *   2) รันฟังก์ชัน exportAll หนึ่งครั้ง → อนุญาตสิทธิ์
 *   3) รันฟังก์ชัน setupTriggers หนึ่งครั้ง → ตั้งรอบอัตโนมัติ
 *
 * ชีตที่ได้:
 *   personnel  — ข้อมูลรายคนล่าสุด (ไม่มีชื่อ-นามสกุล, ไม่มีวันเกิด — เก็บเป็น "อายุ" แทน)
 *   framework  — กรอบอัตรากำลัง
 *   history    — สรุปจำนวนรายวัน (unit × type × position) ต่อท้ายทุกวัน ใช้ดูแนวโน้ม
 *   export_log — บันทึกเวลาที่ export และจำนวนแถว
 */

const SB_URL = 'https://cdhcparkigajxiiyjzjm.supabase.co';
const EXPORT_EVERY_HOURS = 1;     // รอบ export ข้อมูลล่าสุด: 1, 2, 4, 6, 8 หรือ 12 ชั่วโมง
const SNAPSHOT_HOUR = 6;          // เวลาเก็บสรุปรายวันลงชีต history (06:00–07:00)

const PERSONNEL_COLS = 'id,unit,sub_unit,position,level,type,staff_role,competency,status,start_date,position_start_date,birth_date,exit_date,exit_reason,planned_exit_date,planned_exit_reason';

/* ========== งานหลัก ========== */

function exportAll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const token = sbLogin_();
    const people = sbFetchAll_('personnel', PERSONNEL_COLS, token);
    const framework = sbFetchAll_('framework', 'unit,position,quota', token);

    const today = new Date();
    const header = ['id','unit','sub_unit','position','level','type','staff_role','competency','status',
                    'age','service_years','position_years','start_date','exit_date','exit_reason',
                    'planned_exit_date','planned_exit_reason','retire_year_be'];
    const rows = people.map(p => [
      p.id, p.unit, p.sub_unit, p.position, p.level, p.type, p.staff_role, p.competency, p.status,
      yearsBetween_(p.birth_date, today),
      yearsBetween_(p.start_date, today),
      yearsBetween_(p.position_start_date, today),
      toDate_(p.start_date), toDate_(p.exit_date), p.exit_reason,
      toDate_(p.planned_exit_date), p.planned_exit_reason,
      retireYearBE_(p.birth_date)
    ]);
    writeSheet_('personnel', header, rows);
    writeSheet_('framework', ['unit','position','quota'], framework.map(f => [f.unit, f.position, f.quota]));

    logSheet_().appendRow([new Date(), 'export', people.length, framework.length]);

    // ส่ง data.json ขึ้น GitHub ต่อทันที (ข้ามถ้ายังไม่ได้ตั้ง GH_TOKEN/GH_REPO) — พังก็ไม่ทำให้ export ล้ม
    const gp = PropertiesService.getScriptProperties();
    if (gp.getProperty('GH_TOKEN') && gp.getProperty('GH_REPO')) {
      SpreadsheetApp.flush();
      try { pushToGitHub(); } catch (ge) { logSheet_().appendRow([new Date(), 'ERROR github', String(ge).slice(0, 300)]); }
    }
  } catch (e) {
    logSheet_().appendRow([new Date(), 'ERROR', String(e)]);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/** สรุปจำนวนรายวัน ต่อท้ายชีต history (ไม่ลบของเก่า) */
function snapshotDaily() {
  const token = sbLogin_();
  const people = sbFetchAll_('personnel', 'unit,type,position,status', token).filter(p => p.status === 'active');
  const counts = {};
  people.forEach(p => {
    const k = [p.unit || 'ไม่ระบุ', p.type || 'ไม่ระบุ', p.position || 'ไม่ระบุ'].join('\u0001');
    counts[k] = (counts[k] || 0) + 1;
  });
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const rows = Object.keys(counts).map(k => [d].concat(k.split('\u0001'), counts[k]));

  const sh = getSheet_('history');
  if (sh.getLastRow() === 0) sh.appendRow(['date','unit','type','position','count']);
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  logSheet_().appendRow([new Date(), 'snapshot', people.length]);
}

/** รันครั้งเดียว: ตั้งรอบอัตโนมัติ (ลบ trigger เดิมของ 2 ฟังก์ชันนี้ก่อน) */
function setupTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['exportAll','snapshotDaily'].includes(t.getHandlerFunction()))
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('exportAll').timeBased().everyHours(EXPORT_EVERY_HOURS).create();
  ScriptApp.newTrigger('snapshotDaily').timeBased().atHour(SNAPSHOT_HOUR).everyDays(1)
    .inTimezone('Asia/Bangkok').create();
}

/* ========== Supabase ========== */

function props_() {
  const p = PropertiesService.getScriptProperties();
  const cfg = { key: p.getProperty('SUPABASE_ANON_KEY'), email: p.getProperty('SB_EMAIL'), pass: p.getProperty('SB_PASSWORD') };
  if (!cfg.key || !cfg.email || !cfg.pass) throw new Error('ยังไม่ได้ตั้ง Script Properties: SUPABASE_ANON_KEY / SB_EMAIL / SB_PASSWORD');
  return cfg;
}

/** login ด้วยอีเมล/รหัสผ่าน → access token (ข้อมูลผ่าน RLS ตามสิทธิ์บัญชีนี้) */
function sbLogin_() {
  const c = props_();
  const res = UrlFetchApp.fetch(SB_URL + '/auth/v1/token?grant_type=password', {
    method: 'post', contentType: 'application/json',
    headers: { apikey: c.key },
    payload: JSON.stringify({ email: c.email, password: c.pass }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Login Supabase ไม่สำเร็จ: ' + res.getContentText());
  return JSON.parse(res.getContentText()).access_token;
}

/** ดึงทั้งตาราง ทีละ 1000 แถว */
function sbFetchAll_(table, select, token) {
  const key = props_().key, size = 1000, out = [];
  for (let offset = 0; ; offset += size) {
    const url = `${SB_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${size}&offset=${offset}`;
    const res = UrlFetchApp.fetch(url, {
      headers: { apikey: key, Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) throw new Error(`ดึง ${table} ไม่สำเร็จ: ` + res.getContentText());
    const data = JSON.parse(res.getContentText());
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

/* ========== Sheets / helpers ========== */

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function writeSheet_(name, header, rows) {
  const sh = getSheet_(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  sh.setFrozenRows(1);
}
function logSheet_() {
  const sh = getSheet_('export_log');
  if (sh.getLastRow() === 0) sh.appendRow(['time','job','rows_1','rows_2']);
  return sh;
}
function toDate_(s) { return s ? new Date(s + 'T00:00:00+07:00') : ''; }
function yearsBetween_(s, now) {
  if (!s) return '';
  return Math.floor((now - new Date(s)) / (365.2425 * 864e5) * 10) / 10;   // ทศนิยม 1 ตำแหน่ง
}
/** ปีงบที่เกษียณ (พ.ศ.): อายุครบ 60 ปี; เกิด 2 ต.ค. เป็นต้นไป เกษียณปีงบถัดไป */
function retireYearBE_(s) {
  if (!s) return '';
  const d = new Date(s), y60 = d.getFullYear() + 60;
  const afterOct1 = d.getMonth() > 9 || (d.getMonth() === 9 && d.getDate() >= 2);
  return (afterOct1 ? y60 + 1 : y60) + 543;
}
