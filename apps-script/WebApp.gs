/**
 * Web App: Dashboard โครงสร้างกำลังคน (อ่านจากชีต personnel / framework / export_log)
 * วางไฟล์นี้เพิ่มในโปรเจกต์ Export HR (ไม่ต้องแก้ไฟล์ รหัส.gs เดิม)
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('Dashboard โครงสร้างกำลังคน กลุ่มการพยาบาล')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);   // ให้ฝังใน Google Sites ได้
}

/** ส่งข้อมูลให้หน้า dashboard — ใช้ค่าที่แสดงบนชีต (string) เพื่อไม่ให้วันที่เพี้ยน */
function getDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const read = name => {
    const sh = ss.getSheetByName(name);
    return sh && sh.getLastRow() > 0 ? sh.getDataRange().getDisplayValues() : [];
  };
  const log = read('export_log').filter(r => r[1] === 'export');
  return {
    personnel: read('personnel'),
    framework: read('framework'),
    updated: log.length ? log[log.length - 1][0] : ''
  };
}
