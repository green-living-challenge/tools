/* GLC tools: one resident email, ready to copy into Gmail. The address names the challenge and
   carries the draft (email-build.js, readLink); without them it is the default challenge with the
   template text. The numbers are read when the page opens, as the builder reads them (GLC public
   first, the API second). The email sits in the page itself, not in a frame, so select all and
   copy works as it does on a downloaded file; the bar above it cannot be selected. */
(function () {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  var emailEl = byId('email');
  var copyEmailBtn = byId('copy-email');
  var copySubjectBtn = byId('copy-subject');
  var refreshBtn = byId('refresh');
  var editEl = byId('edit');
  var subjectEl = byId('subject');
  var statusEl = byId('status');
  var warningEl = byId('warning');
  var messageEl = byId('message');

  var L = window.GLCLogic;
  var D = window.GLCData;
  var E = window.GLCEmail;
  if (!L || !D || !E) {
    statusEl.textContent = 'This page could not start. Reload it.';
    return;
  }

  var COPY_FAILED = 'Copying did not work in this browser. Select the email with Ctrl+A (Cmd+A on a Mac) and copy it.';
  var link = E.readLink(window.location.hash);
  var settings = link.settings;
  // The builder's folder, which also holds config.json.
  var base = new URL('../', window.location.href).href;
  // What is on the page now: ready once it has the numbers.
  var shown = { email: '', plain: '', subject: '', ready: false, asOf: '' };
  var attempt = 0;
  var messageTimer = null;

  function setMessage(text) {
    clearTimeout(messageTimer);
    messageEl.textContent = text;
    if (text) messageTimer = setTimeout(function () { messageEl.textContent = ''; }, 8000);
  }

  function showWarnings() {
    var list = [];
    if (link.broken) list.push('This link was cut short or changed, so the email shows the template text. Ask for the link again.');
    var places = E.offSiteLinks(settings);
    if (places.length) list.push('This email links to ' + places.join(', ') + ', not only to the GLC leaderboard. Check those links before sending.');
    warningEl.textContent = list.join(' ');
    warningEl.hidden = !list.length;
  }

  // One payload, checked: { ok: true, payload, source } or { ok: false, error }. As in email-app.js.
  function load(config, route, id, gid) {
    return D.loadPayload({
      api: config.api, csv: config.csv, route: route, id: id, gid: gid, base: window.location.href,
      fetchImpl: window.fetch.bind(window),
      check: function (json) { return L.checkPayload(json, route, id); },
      copyMs: L.TIMING.copyMs, giveUpMs: L.TIMING.giveUpMs
    }).then(function (res) {
      var checked = res.ok ? L.checkPayload(res.json, route, id) : { ok: false, error: res.error };
      return checked.ok ? { ok: true, payload: checked.payload, source: res.source } : checked;
    });
  }

  // The registry and the challenge -> { registry, payload, id, error }. payload is null when the
  // challenge could not be read; registry is null when the list could not be. onList(registry, id)
  // runs as soon as the list is in, before the numbers.
  function loadAll(onList) {
    return D.loadConfig(window.fetch.bind(window), base).then(function (cfg) {
      if (!cfg.ok) return { error: cfg.error };
      return load(cfg, 'registry', null, 0).then(function (reg) {
        if (!reg.ok) return { error: reg.error };
        var registry = reg.payload;
        var id = link.id || L.pickDefault(registry, L.todayInDubai(Date.now()));
        var d = id ? L.findChallenge(registry, id) : null;
        if (!d) return { error: { kind: 'missing' } };
        onList(registry, d.id);
        // A registry that had to come from the API means the copy failed: the challenge skips it too.
        return load(cfg, 'challenge', d.id, reg.source === 'api' ? null : d.csvGid).then(function (ch) {
          return { registry: registry, id: d.id, payload: ch.ok ? ch.payload : null, error: ch.ok ? null : ch.error };
        });
      });
    }).catch(function () {
      return { error: { kind: 'unknown' } };
    });
  }

  // The email document -> its body's content in the page, with the body's style on the wrapper.
  function putEmail(emailHtml) {
    var doc = new DOMParser().parseFromString(emailHtml, 'text/html');
    emailEl.setAttribute('style', doc.body.getAttribute('style') || '');
    while (emailEl.firstChild) emailEl.removeChild(emailEl.firstChild);
    Array.prototype.forEach.call(doc.body.childNodes, function (n) {
      emailEl.appendChild(document.importNode(n, true));
    });
  }

  function render(registry, payload, id) {
    var ctx = E.buildContext(registry, payload, id, Date.now());
    shown = {
      email: E.buildEmail(settings, ctx),
      plain: E.buildPlainText(settings, ctx),
      subject: E.subjectLine(settings, ctx),
      ready: ctx.ready,
      asOf: ctx.values.asOf || ''
    };
    putEmail(shown.email);
    subjectEl.textContent = 'Subject: ' + shown.subject;
    // Only a link that carried a draft takes it to the builder; otherwise the builder keeps its own.
    editEl.href = base + '#' + (link.shared && !link.broken ? E.linkHash(id, settings) : 'c=' + encodeURIComponent(id));
    copySubjectBtn.disabled = false;
    copyEmailBtn.disabled = !shown.ready;
  }

  function showError(error) {
    statusEl.textContent = L.errorText(error) +
      (shown.ready && shown.asOf ? ' The email below still has the numbers as of ' + shown.asOf + ', Dubai time.' : '') + ' ';
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'link';
    retry.textContent = 'Try again';
    retry.addEventListener('click', refresh);
    statusEl.appendChild(retry);
  }

  function refresh() {
    var mine = ++attempt;
    refreshBtn.disabled = true;
    statusEl.textContent = 'Loading the latest numbers...';
    loadAll(function (registry, id) {
      // The first time, the email shows at once with grey boxes where the numbers go.
      if (mine === attempt && !shown.email) render(registry, null, id);
    }).then(function (r) {
      if (mine !== attempt) return;
      refreshBtn.disabled = false;
      // A failed refresh keeps the email already shown with its numbers.
      if (r.registry && (r.payload || !shown.ready)) render(r.registry, r.payload, r.id);
      if (r.error) showError(r.error);
      else statusEl.textContent = shown.asOf ? 'Numbers as of ' + shown.asOf + ', Dubai time.' : '';
    });
  }

  // Fallback for browsers without ClipboardItem: select a node and copy it.
  function copyNode(node) {
    try {
      var range = document.createRange();
      range.selectNodeContents(node);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      var ok = document.execCommand('copy');
      sel.removeAllRanges();
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copyEmail() {
    var done = function () { setMessage('Copied. Paste it into a new Gmail message with Ctrl+V (Cmd+V on a Mac).'); };
    var fallback = function () {
      if (copyNode(emailEl)) done();
      else setMessage(COPY_FAILED);
    };
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      var item = new ClipboardItem({
        'text/html': new Blob([shown.email], { type: 'text/html' }),
        'text/plain': new Blob([shown.plain], { type: 'text/plain' })
      });
      navigator.clipboard.write([item]).then(done, fallback);
    } else {
      fallback();
    }
  }

  function copySubject() {
    var done = function () { setMessage('Subject copied.'); };
    var fallback = function () {
      var box = document.createElement('textarea');
      box.value = shown.subject;
      box.setAttribute('readonly', '');
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      box.remove();
      setMessage(ok ? 'Subject copied.' : 'Copying did not work in this browser. The subject is: ' + shown.subject);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(shown.subject).then(done, fallback);
    else fallback();
  }

  // Another link pasted into this tab changes only the hash: start again from it.
  window.addEventListener('hashchange', function () { window.location.reload(); });
  copyEmailBtn.addEventListener('click', copyEmail);
  copySubjectBtn.addEventListener('click', copySubject);
  refreshBtn.addEventListener('click', refresh);
  showWarnings();
  refresh();
})();
