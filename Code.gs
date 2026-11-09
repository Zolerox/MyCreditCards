/**
 * บัตรของฉัน — Google Apps Script สำหรับแจ้งเตือนกำหนดชำระทางอีเมล / LINE ทุกเช้า
 * (ใช้คู่กับแอป index.html — แอปจะส่งสรุปวันครบกำหนดมาเก็บไว้ที่นี่)
 *
 * ติดตั้ง:
 *  1) script.google.com > New project > วางโค้ดนี้ > บันทึก
 *  2) เลือกฟังก์ชัน setup > Run > อนุญาตสิทธิ์ > ดู SYNC_KEY ใน Execution log
 *  3) Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone > Deploy
 *  4) นำ Web app URL + SYNC_KEY ไปกรอกในแอป (เมนู ตั้งค่า)
 *  ** อัปเดตโค้ด: วางทับ > บันทึก > Deploy > Manage deployments > ✎ > Version: New version > Deploy (URL เดิม) **
 *  (ไม่บังคับ) ส่งเข้า LINE: Project Settings > Script properties เพิ่ม
 *     LINE_TOKEN = Channel access token ของ LINE Messaging API
 *     LINE_TO    = userId ของคุณ (ดูได้ใน LINE Developers > Basic settings > Your user ID)
 *  (ไม่บังคับ) EMAIL_TO = อีเมลปลายทาง (ค่าเริ่มต้น = อีเมลเจ้าของสคริปต์)
 */

var PROPS = PropertiesService.getScriptProperties();
var TZ = 'Asia/Bangkok';
var TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** รันครั้งแรกครั้งเดียว: สร้าง SYNC_KEY และตั้งเวลาเตือนทุกวัน 08:00 */
function setup() {
  var key = PROPS.getProperty('SYNC_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
    PROPS.setProperty('SYNC_KEY', key);
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyReminder') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyReminder').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
  Logger.log('SYNC_KEY = ' + key + '  (นำไปกรอกในแอป เมนู ตั้งค่า)');
}

function doGet() {
  return json_({ ok: true, app: 'my-cards-reminder' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var key = PROPS.getProperty('SYNC_KEY');
    if (!key || body.key !== key) return json_({ ok: false, error: 'SYNC_KEY ไม่ถูกต้อง' });
    if (body.data) PROPS.setProperty('DATA', JSON.stringify(body.data));
    if (body.action === 'test') {
      var msg = buildMessage_(true);
      send_('🔔 ทดสอบ: บัตรของฉัน', msg || 'เชื่อมต่อสำเร็จ — ตอนนี้ยังไม่มีบิลที่ต้องเตือน');
    }
    return json_({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** ทำงานทุกเช้าจาก trigger */
function dailyReminder() {
  var msg = buildMessage_(false);
  if (msg) send_('💳 แจ้งเตือนชำระบัตรเครดิต', msg);
}

function buildMessage_(includeUpcoming) {
  var data = JSON.parse(PROPS.getProperty('DATA') || 'null');
  if (!data || !data.ev) return '';
  var today = startOfDay_(new Date());
  var remind = data.remind && data.remind.length ? data.remind : [5, 3, 1, 0];
  var maxR = Math.max.apply(null, remind);
  var overdue = [], due = [], stmt = [];
  data.ev.forEach(function (e) {
    var d = parseIso_(e[0]), n = Math.round((d - today) / 86400000);
    if (e[1] === 's') { if (n === 0) stmt.push('✂️ วันนี้ตัดรอบบัตร ' + e[2]); return; }
    if (e[5]) return; // จ่ายแล้ว / ไม่มียอด
    var amt = e[3] == null ? 'ยังไม่ได้กรอกยอดในแอป' : 'ยอด ' + money_(e[3]) + (e[4] ? ' (ขั้นต่ำ ' + money_(e[4]) + ')' : '');
    if (n < 0 && e[3] != null) overdue.push('🚨 ' + e[2] + ' เลยกำหนดมา ' + (-n) + ' วัน · ' + amt);
    else if (n >= 0 && (remind.indexOf(n) >= 0 || (includeUpcoming && n <= Math.max(maxR, 7)))) {
      due.push('⏰ ' + e[2] + ' ครบกำหนด ' + fmt_(d) + ' (' + (n === 0 ? 'วันนี้' : n === 1 ? 'พรุ่งนี้' : 'อีก ' + n + ' วัน') + ') · ' + amt);
    }
  });
  var lines = [].concat(overdue, due, stmt);
  if (!lines.length) return '';
  if (data.inst) lines.push('', '📆 ค่างวดผ่อนรวม ' + money_(data.inst) + ' / เดือน');
  var age = Math.round((today - startOfDay_(new Date(data.at))) / 86400000);
  if (age > 30) lines.push('', 'ℹ️ ข้อมูลซิงก์ล่าสุดเมื่อ ' + age + ' วันก่อน — เปิดแอปเพื่ออัปเดต');
  return lines.join('\n');
}

function send_(subject, text) {
  var to = PROPS.getProperty('EMAIL_TO') || Session.getEffectiveUser().getEmail();
  if (to) MailApp.sendEmail(to, subject, text);
  var token = PROPS.getProperty('LINE_TOKEN'), lineTo = PROPS.getProperty('LINE_TO');
  if (token && lineTo) {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: lineTo, messages: [{ type: 'text', text: subject + '\n\n' + text }] }),
    });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function startOfDay_(d) { var s = Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); return parseIso_(s); }
function parseIso_(s) { var p = s.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
function fmt_(d) { return d.getDate() + ' ' + TH_MONTHS[d.getMonth()]; }
function money_(n) { return '฿' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
