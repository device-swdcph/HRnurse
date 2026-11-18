/**
 * ส่งข้อมูลกำลังคน (แบบตัดรายละเอียดระบุตัวบุคคลแล้ว) ขึ้น GitHub → data.json
 * หน้า index.html บน GitHub Pages อ่านไฟล์นี้ไปแสดง dashboard
 *
 * ตั้งค่าครั้งแรก:
 *   1) พร็อพเพอร์ตี้ของสคริปต์ → เพิ่ม
 *        GH_TOKEN = Fine-grained token (Contents: Read and write เฉพาะ repo นี้)
 *        GH_REPO  = device-swdcph/HRnurse   (owner/repo)
 *   2) รัน pushToGitHub หนึ่งครั้ง → อนุญาตสิทธิ์
 *   3) ไม่ต้องตั้ง trigger แยก — exportAll (Code.gs) เรียก pushToGitHub ต่อท้ายทุกรอบอยู่แล้ว
 *      (setupGitHubTrigger มีไว้เผื่ออยากแยกรอบเอง)
 *
 * ข้อมูลที่ส่ง: ไม่มี id / ชื่อ / วันเกิด / อายุจริง / วันที่เริ่มงาน
 *   เหลือเฉพาะ หน่วยงาน, ตำแหน่ง, ประเภท, ระดับ, บทบาท, สมรรถนะ, ช่วงอายุ, ปีงบเกษียณ, สถานะ
 *   ปีงบเกษียณส่งเฉพาะที่อยู่ใน 10 ปีงบข้างหน้า (ช่วงที่กราฟแสดง) — ถ้าส่งทุกคนจะย้อนเป็นปีเกิดได้
 * commit เฉพาะตอนข้อมูลเปลี่ยน (ไม่สร้าง commit ซ้ำทุกชั่วโมง)
 */

const GH_FILE = 'data.json';
const GH_BRANCH = 'main';
const GH_FIELDS = ['unit','position','type','level','staff_role','competency','age_band','retire_fy','status'];
const GH_RETIRE_WINDOW = 10;   // ต้องตรงกับจำนวนปีในกราฟเกษียณของ index.html

function pushToGitHub() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GH_TOKEN'), repo = props.getProperty('GH_REPO');
  if (!token || !repo) throw new Error('ยังไม่ได้ตั้ง GH_TOKEN / GH_REPO ในพร็อพเพอร์ตี้ของสคริปต์');

  // อ่านจากชีต personnel ที่ exportAll เขียนไว้
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('personnel');
  const values = sh.getDataRange().getDisplayValues();
  const h = values[0], col = name => h.indexOf(name);
  const now = new Date(), curFY = now.getFullYear() + 543 + (now.getMonth() >= 9 ? 1 : 0);
  const retireFY = v => {
    const y = Number(String(v).replace(/,/g, ''));
    return y >= curFY && y < curFY + GH_RETIRE_WINDOW ? y : '';
  };
  const rows = values.slice(1).map(r => [
    r[col('unit')], r[col('position')], r[col('type')], r[col('level')],
    r[col('staff_role')], r[col('competency')], ageBand_(r[col('age')]),
    retireFY(r[col('retire_year_be')]), r[col('status')]
  ]);
  rows.sort((a, b) => a.join('|').localeCompare(b.join('|')));   // สลับลำดับ ไม่ให้เทียบกับลำดับในระบบต้นทางได้

  // ข้ามถ้าข้อมูลไม่เปลี่ยน
  const body = JSON.stringify({ fields: GH_FIELDS, rows: rows });
  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, body, Utilities.Charset.UTF_8));
  if (hash === props.getProperty('GH_LAST_HASH')) return;

  const json = JSON.stringify({
    updated: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'),
    fields: GH_FIELDS, rows: rows
  });

  const api = `https://api.github.com/repos/${repo}/contents/${GH_FILE}`;
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

  // ต้องใช้ sha ของไฟล์เดิมถึงจะเขียนทับได้
  const cur = UrlFetchApp.fetch(api + '?ref=' + GH_BRANCH, { headers: headers, muteHttpExceptions: true });
  const sha = cur.getResponseCode() === 200 ? JSON.parse(cur.getContentText()).sha : undefined;

  const res = UrlFetchApp.fetch(api, {
    method: 'put', contentType: 'application/json', headers: headers, muteHttpExceptions: true,
    payload: JSON.stringify({
      message: 'update data.json ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm'),
      content: Utilities.base64Encode(json, Utilities.Charset.UTF_8),
      branch: GH_BRANCH, sha: sha
    })
  });
  const code = res.getResponseCode();
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('export_log');
  if (code !== 200 && code !== 201) {
    if (log) log.appendRow([new Date(), 'ERROR github', res.getContentText().slice(0, 300)]);
    throw new Error('ส่งขึ้น GitHub ไม่สำเร็จ (' + code + '): ' + res.getContentText());
  }
  props.setProperty('GH_LAST_HASH', hash);
  if (log) log.appendRow([new Date(), 'github', rows.length]);
}

/** รันครั้งเดียว: ส่งขึ้น GitHub ทุกชั่วโมง */
function setupGitHubTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'pushToGitHub')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pushToGitHub').timeBased().everyHours(1).create();
}

function ageBand_(a) {
  if (a === '' || a == null) return '';
  a = Number(String(a).replace(/,/g, ''));
  if (isNaN(a)) return '';
  return a < 30 ? '< 30' : a < 40 ? '30–39' : a < 50 ? '40–49' : a < 55 ? '50–54' : a < 60 ? '55–59' : '≥ 60';
}
