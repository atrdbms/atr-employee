/**
 * Amrabad Tiger Reserve – Employee Database : data service (Google Apps Script)
 *
 * The website (GitHub Pages) talks to this script, and this script reads/writes the Google Sheet.
 *  - "employee data" tab : one row per employee (the database)
 *  - "categries" tab     : master list of posts (Category > Designation > Place of working >
 *                          Circle > District > Division > Range > Section > Beat > Basecamp)
 *  - M-STrIPES "Patrol details" sheet : read-only, summarised per officer (Name + Designation)
 *
 * Deploy: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 */

const SPREADSHEET_ID = '1tHgRWp41yk4ECGzmKRO0wG-FlKAvsSBQ5JXAGfz8a5A';
const DATA_SHEET = 'employee data';
const MASTER_SHEET = 'categries';
const MSTRIPES_SHEET_ID = '1TYnTFCx0BiQYlaupeiTu2tK5TpNIPA4FTTgSgzCbVHA'; // M-STrIPES "Petrol details"
const PHOTO_FOLDER_NAME = 'ATR Employee Photos';

// Optional: set a passcode to protect the data (staff mobile/EPF numbers).
// Leave '' for no passcode. Everyone using the website must then type this passcode once.
const PASSCODE = '';

// Columns that must be stored as text (keeps leading zeros in mobile / EPF numbers).
const TEXT_COLUMNS = ['Mobile No', 'EPF No', 'Employee ID'];

/* ------------------------------------------------------------------ */
/* Entry points                                                         */
/* ------------------------------------------------------------------ */

/** Opening the script URL in a browser shows the website itself (optional, besides GitHub Pages). */
function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    return json_(handle_(e.parameter.action, [], e.parameter.key));
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Amrabad Tiger Reserve – Employee Database')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** JSON API used by the GitHub Pages website. Body: {"action": "...", "args": [...], "key": "..."} */
function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ error: 'Bad request' }); }
  return json_(handle_(req.action, req.args || [], req.key));
}

/** Same API for pages served by this script (google.script.run). */
function apiCall(action, args, key) {
  return handle_(action, args || [], key);
}

function handle_(action, args, key) {
  try {
    if (PASSCODE && String(key || '') !== PASSCODE) return { error: 'AUTH', message: 'Passcode required' };
    switch (action) {
      case 'ping': return { ok: true };
      case 'getAppData': return { ok: true, data: getAppData_() };
      case 'saveEmployee': return { ok: true, data: saveEmployee_(args[0]) };
      case 'deleteEmployee': return { ok: true, data: deleteEmployee_(args[0], args[1]) };
      case 'getMstripes': return { ok: true, data: getMstripes_(args[0] === true) };
      default: return { error: 'Unknown action' };
    }
  } catch (err) {
    return { error: 'ERR', message: err.message || String(err) };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* Employee data                                                        */
/* ------------------------------------------------------------------ */

function ss_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd-MM-yyyy');
  return v === null || v === undefined ? '' : String(v).trim();
}

function readTable_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return { headers: [], rows: [] };
  const headers = values[0].map(cell_);
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const obj = { _row: r + 1 };
    let any = false;
    headers.forEach(function (h, c) {
      if (!h) return;
      obj[h] = cell_(values[r][c]);
      if (obj[h] !== '') any = true;
    });
    if (any) rows.push(obj);
  }
  return { headers: headers.filter(String), rows: rows };
}

function getAppData_() {
  const ss = ss_();
  const data = readTable_(ss.getSheetByName(DATA_SHEET));
  const master = readTable_(ss.getSheetByName(MASTER_SHEET));
  return {
    headers: data.headers,
    employees: data.rows,
    masterHeaders: master.headers,
    master: master.rows,
    loadedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm'),
    sheetUrl: ss.getUrl()
  };
}

function photoFolder_() {
  const it = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
}

function savePhoto_(dataUrl, name) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return '';
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + '.jpg');
  const file = photoFolder_().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* policy may block */ }
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400';
}

/** Add (no _row) or update (with _row) one employee. Returns fresh app data. */
function saveEmployee_(rec) {
  if (!rec || !rec['Name']) throw new Error('Name is required');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = ss_().getSheetByName(DATA_SHEET);
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(cell_);
    const idCol = headers.indexOf('ID No');
    let rowNum = Number(rec._row) || 0;

    if (rowNum) {
      const current = sheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];
      if (idCol >= 0 && cell_(current[idCol]) !== cell_(rec['ID No'])) {
        throw new Error('This record was changed by someone else. Please refresh and try again.');
      }
    } else {
      rowNum = sheet.getLastRow() + 1;
      if (idCol >= 0) {
        const last = sheet.getLastRow();
        const ids = last > 1 ? sheet.getRange(2, idCol + 1, last - 1, 1).getValues() : [];
        const max = ids.reduce(function (m, r) { return Math.max(m, Number(r[0]) || 0); }, 0);
        rec['ID No'] = String(max + 1);
      }
    }

    if (rec._photoData) {
      rec['Photo'] = savePhoto_(rec._photoData, (rec['ID No'] || 'emp') + '_' + (rec['Name'] || ''));
    }

    const row = headers.map(function (h) { return h && rec[h] !== undefined && rec[h] !== null ? String(rec[h]).trim() : ''; });
    headers.forEach(function (h, i) {
      if (TEXT_COLUMNS.indexOf(h) >= 0) sheet.getRange(rowNum, i + 1).setNumberFormat('@');
    });
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([row]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return getAppData_();
}

/** Delete one employee row (checked against its ID No). Returns fresh app data. */
function deleteEmployee_(rowNum, idNo) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = ss_().getSheetByName(DATA_SHEET);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(cell_);
    const idCol = headers.indexOf('ID No');
    if (cell_(sheet.getRange(rowNum, idCol + 1).getValue()) !== cell_(idNo)) {
      throw new Error('This record was changed by someone else. Please refresh and try again.');
    }
    sheet.deleteRow(rowNum);
  } finally {
    lock.releaseLock();
  }
  return getAppData_();
}

/* ------------------------------------------------------------------ */
/* M-STrIPES link: one summary line per officer (Name + Designation)   */
/* ------------------------------------------------------------------ */

function getMstripes_(force) {
  const cache = CacheService.getScriptCache();
  if (!force) {
    const hit = cache.get('mstripes_v1');
    if (hit) return JSON.parse(hit);
  }
  const sh = SpreadsheetApp.openById(MSTRIPES_SHEET_ID).getSheets()[0];
  const lastRow = sh.getLastRow(), lastCol = Math.min(sh.getLastColumn(), 15);
  const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const h = values[0].map(function (x) { return String(x).trim().toLowerCase(); });
  const ix = function (n) { return h.findIndex(function (x) { return x.indexOf(n) >= 0; }); };
  const I = { division: ix('division'), range: ix('range'), name: ix('name'), desig: ix('designation'),
              beat: ix('beat'), dist: ix('distance'), date: ix('start date'), animal: ix('animal') };
  const tz = Session.getScriptTimeZone();
  const toIso = function (v) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    const m = String(v || '').match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/);
    return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
  };
  const g = function (row, k) { return I[k] < 0 ? '' : String(row[I[k]] === null ? '' : row[I[k]]).replace(/\s+/g, ' ').trim(); };
  const map = {};
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const name = g(row, 'name');
    if (!name) continue;
    const desig = g(row, 'desig');
    const key = name.toLowerCase() + '|' + desig.toUpperCase();
    let e = map[key];
    if (!e) e = map[key] = { name: name, desig: desig, division: '', range: '', beats: {}, p: 0, km: 0, days: {}, obs: 0, last: '' };
    if (!e.division) e.division = g(row, 'division');
    if (!e.range) e.range = g(row, 'range');
    const beat = g(row, 'beat'); if (beat) e.beats[beat] = 1;
    const dist = parseFloat(row[I.dist]) || 0;
    const d = I.date >= 0 ? toIso(row[I.date]) : '';
    if (dist > 0) { e.p++; e.km += dist; if (d) e.days[d] = 1; }
    if (g(row, 'animal')) e.obs++;
    if (d && d > e.last) e.last = d;
  }
  const out = Object.keys(map).map(function (k) {
    const e = map[k];
    return { name: e.name, desig: e.desig, division: e.division, range: e.range,
             beats: Object.keys(e.beats).slice(0, 6).join(', '), patrols: e.p, km: Math.round(e.km * 10) / 10,
             days: Object.keys(e.days).length, obs: e.obs, last: e.last };
  });
  const result = { officers: out, rows: values.length - 1,
                   loadedAt: Utilities.formatDate(new Date(), tz, 'dd-MM-yyyy HH:mm') };
  try { cache.put('mstripes_v1', JSON.stringify(result), 6 * 3600); } catch (e) { /* too large to cache */ }
  return result;
}
