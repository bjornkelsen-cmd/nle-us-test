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
var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxdD_hDgYAkp2WNJ6RYRQ1S9Nk0izekMvS6pq_B_mMAICJu4HZvbjKt9QwwgE3Q3xiV-w/exec';
var FROM = 'bk@nle.dk';
var GMAIL_FROM = 'bjornkelsen@gmail.com';
var SUBJECT = 'NLE ARBEJDE';
var LABEL_SENT = 'nle-preview-sendt';
var LABEL_FEJL = 'nle-mail-fejl';

function saveGithubToken(token) {
  var value = String(token || '').trim();
  if (!value) throw new Error('Tom GitHub-nøgle.');
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', value);
  return 'ok';
}

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
      '(from:' + FROM + ' OR from:' + GMAIL_FROM + ') subject:"' + SUBJECT + '" newer_than:2d',
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
  var messages = thread.getMessages();
  if (!messages.length) return;
  var entries = [];
  for (var i = 0; i < messages.length; i++) {
    var fromUser = isCommandSender(messages[i].getFrom());
    var isMail = fromUser && normalizeSubject(messages[i].getSubject()) === SUBJECT && !isOwnNotice(messages[i].getPlainBody());
    entries.push({ fromUser: fromUser, isMail: isMail, body: messages[i].getPlainBody() });
  }
  for (var n = 0; n < messages.length; n++) {
    if (!entries[n].isMail) continue;
    var id = messages[n].getId();
    if (isHandled(id)) continue;
    if (answerBeforeNextCommand(entries, n)) {
      markHandled(id);
      continue;
    }
    handleMessage(thread, messages[n]);
    if (isHandled(messages[n].getId())) markLaterSameDeletes(messages, entries, n);
    return;
  }
}

function markLaterSameDeletes(messages, entries, index) {
  var parsed = parseMail(entries[index].body);
  if (!parsed || parsed.action !== 'delete') return;
  for (var j = index + 1; j < messages.length; j++) {
    if (!entries[j].isMail || isHandled(messages[j].getId())) continue;
    var later = parseMail(entries[j].body);
    if (later && later.action === 'delete' && later.nr === parsed.nr) {
      markHandled(messages[j].getId());
    }
  }
}

function handleMessage(thread, message) {
  var parsed = parseMail(message.getPlainBody());
  if (!parsed) {
    message.reply(
      'Mailen skal se sådan ud:\n\nADD\n06\nTitel\nTeksten til blokken.\n\neller\n\nDEL 05'
    );
    thread.addLabel(userLabel(LABEL_FEJL));
    markHandled(message.getId());
    return;
  }
  if (parsed.action === 'delete') {
    handleDelete(thread, message, parsed.nr);
    return;
  }
  var pushed = upsertPreview(parsed);
  if (!pushed.ok) {
    message.reply('Preview blev ikke opdateret.\n' + pushed.error);
    thread.addLabel(userLabel(LABEL_FEJL));
    markHandled(message.getId());
    return;
  }
  if (!waitForPages(parsed.nr, parsed.titel)) return;
  var link = previewLink();
  if (!link) return;
  message.reply(
    'Preview er klar:\n' + link + '\n\n' +
    parsed.nr + ' ' + parsed.titel + '\n' + parsed.tekst + '\n\n' +
    'Tryk Godkend på siden. Det lægger det på live.'
  );
  thread.addLabel(userLabel(LABEL_SENT));
  markHandled(message.getId());
}

function handleDelete(thread, message, nr) {
  var removed = removePreview(nr);
  if (!removed.ok) {
    message.reply('Preview blev ikke opdateret.\n' + removed.error);
    thread.addLabel(userLabel(LABEL_FEJL));
    markHandled(message.getId());
    return;
  }
  if (removed.already) {
    var live = githubGet('data.json');
    if (!live.ok) {
      message.reply('Preview blev ikke opdateret.\n' + live.error);
      thread.addLabel(userLabel(LABEL_FEJL));
      markHandled(message.getId());
      return;
    }
    if (!jsonHasNr(live.text, nr)) {
      message.reply('Blok ' + nr + ' findes ikke.');
      thread.addLabel(userLabel(LABEL_FEJL));
      markHandled(message.getId());
      return;
    }
  }
  if (!waitUntilGone(nr)) return;
  var link = previewLink();
  if (!link) return;
  message.reply(
    'Preview er klar:\n' + link + '\n\n' +
    'Blok ' + nr + ' er fjernet fra preview.\n\n' +
    'Tryk Godkend på siden. Det fjerner den på live.'
  );
  thread.addLabel(userLabel(LABEL_SENT));
  markHandled(message.getId());
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
    var note = result.already ? 'Allerede live.' : 'Live er opdateret. Genindlæs om et minut, hvis siden ikke har skiftet.';
    return redirectPage(SITE, note);
  } finally {
    lock.releaseLock();
  }
}

function parseMail(body) {
  var lines = String(body || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  var i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return null;
  var firstLine = lines[i].trim();
  var sameLine = firstLine.match(/^(?:DEL|DELETE)\s+(\d{2})$/i);
  if (sameLine) return { action: 'delete', nr: sameLine[1] };
  if (firstLine.toUpperCase() === 'DEL' || firstLine.toUpperCase() === 'DELETE') {
    i++;
    while (i < lines.length && !lines[i].trim()) i++;
    if (i < lines.length && /^\d{2}$/.test(lines[i].trim())) {
      return { action: 'delete', nr: lines[i].trim() };
    }
    return null;
  }
  var block = parseAdd(body);
  if (!block) return null;
  block.action = 'add';
  return block;
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

function removePreview(nr) {
  var file = githubGet('data-preview.json');
  if (!file.ok) return file;
  var data = JSON.parse(file.text);
  var removed = removeBlock(data, nr);
  if (!removed.found) return { ok: true, already: true };
  data.arbejde = removed.arbejde;
  var next = JSON.stringify(data, null, 2) + '\n';
  var put = githubPut('data-preview.json', next, file.sha, 'Remove block ' + nr + ' from preview');
  if (!put.ok) return put;
  return { ok: true, already: false };
}

function removeBlock(data, nr) {
  var blocks = (data && data.arbejde) || [];
  var next = [];
  var found = false;
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].nr === nr) {
      found = true;
      continue;
    }
    next.push(blocks[i]);
  }
  return { found: found, arbejde: next };
}

function jsonHasNr(text, nr) {
  try {
    var data = JSON.parse(text);
  } catch (err) {
    return false;
  }
  var blocks = data.arbejde || [];
  for (var i = 0; i < blocks.length; i++) {
    if (blocks[i].nr === nr) return true;
  }
  return false;
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

function waitUntilGone(nr) {
  for (var i = 0; i < 12; i++) {
    if (pagesLacks(nr)) return true;
    Utilities.sleep(10000);
  }
  return pagesLacks(nr);
}

function pagesLacks(nr) {
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
  return !jsonHasNr(JSON.stringify(data), nr);
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
  var token = PropertiesService.getScriptProperties().getProperty('GODKEND_TOKEN');
  if (!WEBAPP_URL || !token) return '';
  return WEBAPP_URL + '?action=godkend&token=' + encodeURIComponent(token);
}

function previewLink() {
  var token = PropertiesService.getScriptProperties().getProperty('GODKEND_TOKEN');
  if (!token) return '';
  return PREVIEW_URL + '&k=' + encodeURIComponent(token);
}

function isCommandSender(from) {
  var text = String(from || '').toLowerCase();
  return text.indexOf(FROM) !== -1 || text.indexOf(GMAIL_FROM) !== -1;
}

function isOwnNotice(body) {
  var text = String(body || '');
  if (text.indexOf('Preview er klar') !== -1) return true;
  if (text.indexOf('Mailen skal se sådan ud') !== -1) return true;
  if (text.indexOf('Preview blev ikke opdateret') !== -1) return true;
  if (text.indexOf('findes ikke.') !== -1) return true;
  return text.indexOf(PREVIEW_URL) !== -1 && text.indexOf('Godkend') !== -1;
}

function normalizeSubject(subject) {
  var text = String(subject || '').trim();
  var next = text.replace(/^(?:re|fwd|fw)\s*:\s*/i, '');
  while (next !== text) {
    text = next.trim();
    next = text.replace(/^(?:re|fwd|fw)\s*:\s*/i, '');
  }
  return text;
}

function answerBeforeNextCommand(entries, index) {
  var nextUser = entries.length;
  for (var j = index + 1; j < entries.length; j++) {
    if (entries[j].fromUser && entries[j].isMail) {
      nextUser = j;
      break;
    }
  }
  for (var k = index + 1; k < nextUser; k++) {
    var body = String(entries[k].body || '');
    if (body.indexOf(PREVIEW_URL) !== -1) return true;
    if (body.indexOf('Mailen skal se sådan ud') !== -1) return true;
    if (body.indexOf('findes ikke.') !== -1) return true;
    if (body.indexOf('Preview blev ikke opdateret') !== -1) return true;
  }
  return false;
}

function handledIds() {
  var raw = PropertiesService.getScriptProperties().getProperty('HANDLED_IDS') || '';
  if (!raw) return [];
  return raw.split(',');
}

function isHandled(id) {
  return handledIds().indexOf(id) !== -1;
}

function markHandled(id) {
  if (!id || isHandled(id)) return;
  var ids = handledIds();
  ids.push(id);
  if (ids.length > 200) ids = ids.slice(ids.length - 200);
  PropertiesService.getScriptProperties().setProperty('HANDLED_IDS', ids.join(','));
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
