/**
 * Study data receiver — paste this into a Google Apps Script bound to
 * a Google Sheet (open the Sheet → Extensions → Apps Script), then:
 *
 *   Deploy → New deployment → type "Web app"
 *     Execute as:            Me
 *     Who has access:        Anyone
 *
 * Copy the web-app URL it gives you into LOG_ENDPOINT in study.js.
 *
 * Each logged event becomes one row in the first sheet tab.
 */
var HEADERS = [
  "received_at", "pid", "order", "test", "page", "seq",
  "timestamp", "rel_ms", "screen", "type", "name", "detail"
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var body = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
    var rows = (body.events || []).map(function (ev) {
      return [
        new Date(),
        body.pid || "",
        (body.order || []).join(" > "),
        body.test ? "TRUE" : "",
        ev.page || "",
        ev.i,
        new Date(ev.t),
        ev.rel,
        ev.screen || "",
        ev.type || "",
        ev.name || "",
        JSON.stringify(ev.detail || null)
      ];
    });
    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length)
           .setValues(rows);
    }
    return ContentService.createTextOutput("ok");
  } catch (err) {
    return ContentService.createTextOutput("error: " + err);
  } finally {
    lock.releaseLock();
  }
}
