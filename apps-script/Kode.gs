/**
 * NLE ARBEJDE på Gmail. Ingen lokal proces og ingen AI.
 *
 * Script properties:
 *   GITHUB_TOKEN   fin-grained PAT, kun bjornkelsen-cmd/nle-us-test, Contents: Read and write
 *   GODKEND_TOKEN  sættes af install()
 *
 * Kør install() én gang efter at webappen er udgivet (Execute as me, Who has access: Anyone).
 * Triggeren kører checkMail hvert minut.
 */
var REPO = 'bjornkelsen-cmd/nle-us-test';
var BRANCH = 'main';
var SITE = 'https://bjornkelsen-cmd.github.io/nle-us-test/';
var PREVIEW_URL = SITE + '?preview=1';
var FROM = 'bk@nle.dk';
var SUBJECT = 'NLE ARBEJDE';
var LABEL_SENT = 'nle-preview-sendt';
var LABEL_FEJL = 'nle-mail-fejl';

function install() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('GITHUB_TOKEN')) {
    throw new Error('Sæt Script Property GITHUB_TOKEN først.');
  }
  if (!props.getProperty('GODKEND_TOKEN')) {
    props.setProperty('GODKEND_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkMail') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkMail').timeBased().everyMinutes(1).create();
  var url = ScriptApp.getService().getUrl();
  if (!url) {
    throw new Error('Udgiv som webapp først (Execute as me, Anyone), og kør install igen.');
  }
  Logger.log(url);
}

function checkMail() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var threads = GmailApp.search(
      'from:' + FROM + ' subject:"' + SUBJECT + '" newer_than:2d',
      0,
      10
    );
    for (var i = 0; i < threads.length; i++) {
      handleThread(threads[i]);
    }
  } finally {
    lock.releaseLock();
  }
}

function handleThread(thread) {
  var labels = thread.getLabels();
  for (var i = 0; i < labels.length; i++) {
    var name = labels[i].getName();
    if (name === LABEL_SENT || name === LABEL_FEJL) return;
  }
  var messages = thread.getMessages();
  if (!messages.length) return;
  var first = messages[0];
  if (String(first.getFrom()).indexOf(FROM) === -1) return;
  if (String(first.getSubject()).trim() !== SUBJECT) return;
  var blob = threadBody(messages);
  if (blob.indexOf(PREVIEW_URL) !== -1) {
    thread.addLabel(userLabel(LABEL_SENT));
    return;
  }
  var parsed = parseAdd(first.getPlainBody());
  if (!parsed) {
    first.reply(
      'Mailen skal se sådan ud:\n\nADD\n06\nTitel\nTeksten til blokken.'
    );
    thread.addLabel(userLabel(LABEL_FEJL));
    return;
  }
  var pushed = upsertPreview(parsed);
  if (!pushed.ok) {
    first.reply('Preview blev ikke opdateret.\n' + pushed.error);
    thread.addLabel(userLabel(LABEL_FEJL));
    return;
  }
  if (!waitForPages(parsed.nr, parsed.titel)) return;
  var link = godkendLink();
  if (!link) return;
  first.reply(
    'Preview er klar:\n' + PREVIEW_URL + '\n\n' +
    parsed.nr + ' ' + parsed.titel + '\n' + parsed.tekst + '\n\n' +
    'Godkend lægger det på live:\n' + link
  );
  thread.addLabel(userLabel(LABEL_SENT));
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.action !== 'godkend') {
    return HtmlService.createHtmlOutput('Ukendt.');
  }
  var expected = PropertiesService.getScriptProperties().getProperty('GODKEND_TOKEN');
  if (!expected || params.token !== expected) {
    return HtmlService.createHtmlOutput('Linket virker ikke.');
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var result = promote();
    if (!result.ok) {
      return HtmlService.createHtmlOutput('Live blev ikke opdateret. ' + escapeHtml(result.error));
    }
    var note = result.already ? 'Allerede live.' : 'Live er opdateret. Genindlæs om et minut, hvis den nye blok mangler.';
    return redirectPage(SITE, note);
  } finally {
    lock.releaseLock();
  }
}

function parseAdd(body) {
  var lines = String(body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  var i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length || lines[i].trim().toUpperCase() !== 'ADD') return null;
  i++;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length || !/^\d{2}$/.test(lines[i].trim())) return null;
  var nr = lines[i].trim();
  i++;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length || !lines[i].trim()) return null;
  var titel = lines[i].trim();
  i++;
  var tekstLines = [];
  for (; i < lines.length; i++) {
    if (lines[i].trim() === '--' || lines[i].trim() === '-- ') break;
    tekstLines.push(lines[i]);
  }
  var tekst = tekstLines.join('\n').trim();
  if (!tekst) return null;
  return { nr: nr, titel: titel, tekst: tekst };
}

function upsertPreview(block) {
  var file = githubGet('data-preview.json');
  if (!file.ok) return file;
  var data = JSON.parse(file.text);
  if (!data.arbejde) data.arbejde = [];
  var found = false;
  for (var i = 0; i < data.arbejde.length; i++) {
    if (data.arbejde[i].nr === block.nr) {
      data.arbejde[i].titel = block.titel;
      data.arbejde[i].tekst = block.tekst;
      found = true;
      break;
    }
  }
  if (!found) data.arbejde.push({ nr: block.nr, titel: block.titel, tekst: block.tekst });
  var next = JSON.stringify(data, null, 2) + '\n';
  if (next === file.text) return { ok: true };
  return githubPut('data-preview.json', next, file.sha, 'Update preview from NLE ARBEJDE mail');
}

function promote() {
  var preview = githubGet('data-preview.json');
  if (!preview.ok) return preview;
  var live = githubGet('data.json');
  if (!live.ok) return live;
  if (sameArbejde(preview.text, live.text)) return { ok: true, already: true };
  var put = githubPut('data.json', preview.text, live.sha, 'Promote preview to live');
  if (!put.ok) return put;
  return { ok: true, already: false };
}

function waitForPages(nr, titel) {
  for (var i = 0; i < 12; i++) {
    if (pagesHas(nr, titel)) return true;
    Utilities.sleep(10000);
  }
  return pagesHas(nr, titel);
}

function pagesHas(nr, titel) {
  var res = UrlFetchApp.fetch(SITE + 'data-preview.json?t=' + new Date().getTime(), {
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (res.getResponseCode() !== 200) return false;
  try {
    var data = JSON.parse(res.getContentText());
  } catch (err) {
    return false;
  }
  var blocks = data.arbejde || [];
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].nr === nr && blocks[i].titel === titel) return true;
  }
  return false;
}

function githubGet(path) {
  var res = UrlFetchApp.fetch(githubUrl(path), {
    method: 'get',
    headers: githubHeaders(),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    return { ok: false, error: 'GitHub ' + res.getResponseCode() + ' ved læsning af ' + path };
  }
  var body = JSON.parse(res.getContentText());
  var clean = String(body.content || '').replace(/\n/g, '');
  var text = Utilities.newBlob(Utilities.base64Decode(clean)).getDataAsString('UTF-8');
  return { ok: true, text: text, sha: body.sha };
}

function githubPut(path, text, sha, message) {
  var payload = {
    message: message,
    content: Utilities.base64Encode(text, Utilities.Charset.UTF_8).replace(/\n/g, ''),
    branch: BRANCH
  };
  if (sha) payload.sha = sha;
  var res = UrlFetchApp.fetch(githubUrl(path), {
    method: 'put',
    headers: githubHeaders(),
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    contentType: 'application/json'
  });
  var code = res.getResponseCode();
  if (code !== 200 && code !== 201) {
    return { ok: false, error: 'GitHub ' + code + ' ved skrivning af ' + path };
  }
  return { ok: true };
}

function githubUrl(path) {
  return 'https://api.github.com/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH;
}

function githubHeaders() {
  return {
    Authorization: 'Bearer ' + PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN'),
    Accept: 'application/vnd.github+json',
    'User-Agent': 'nle-us-test',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function godkendLink() {
  var base = ScriptApp.getService().getUrl();
  var token = PropertiesService.getScriptProperties().getProperty('GODKEND_TOKEN');
  if (!base || !token) return '';
  return base + '?action=godkend&token=' + encodeURIComponent(token);
}

function userLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function threadBody(messages) {
  var parts = [];
  for (var i = 0; i < messages.length; i++) parts.push(messages[i].getPlainBody());
  return parts.join('\n');
}

function sameArbejde(a, b) {
  return JSON.stringify(JSON.parse(a).arbejde) === JSON.stringify(JSON.parse(b).arbejde);
}

function redirectPage(url, note) {
  var html = '<!doctype html><meta charset="utf-8">' +
    '<meta http-equiv="refresh" content="0;url=' + escapeHtml(url) + '">' +
    '<title>NLE</title><p>' + escapeHtml(note) + '</p>' +
    '<p><a href="' + escapeHtml(url) + '">Gå til siden</a></p>';
  return HtmlService.createHtmlOutput(html);
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
