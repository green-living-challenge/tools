/* GLC tools: the email builder page. Reads the registry and one challenge like the hub does
   (GLC public first, the API second), keeps one draft per challenge in this browser, and shows
   the email that email-build.js makes. Spec: docs/superpowers/specs/2026-10-12-email-builder-design.md */
(function () {
  'use strict';

  var rootEl = document.getElementById('root');
  if (!window.React || !window.ReactDOM || !window.htm || !window.GLCLogic || !window.GLCData || !window.GLCEmail) {
    if (rootEl) rootEl.textContent = 'The email builder could not start. Reload the page.';
    return;
  }

  var h = React.createElement;
  var html = htm.bind(h);
  var L = window.GLCLogic;
  var D = window.GLCData;
  var E = window.GLCEmail;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var store = D.safeStorage(function () { return window.localStorage; });
  var DRAFT_PREFIX = 'glc-email:v1:';
  var TOKENS = '{challenge} {week} {participants} {total} {unit} {daysLeft} {endDate} {asOf} {tagline} {prizes}';
  var COPY_FAILED = 'Copying did not work in this browser. Use Download .html, open the file, select all and copy.';

  // One payload, checked: { ok: true, payload, source } or { ok: false, error }.
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

  // The registry and one challenge, read again each time attempt changes (Refresh data, Try
  // again, another challenge picked). wanted: the challenge asked for, or null for the default.
  function useData(wanted, attempt) {
    var s = useState({ loading: true, registry: null, payload: null, error: null });
    var data = s[0];
    var setData = s[1];
    useEffect(function () {
      var cancelled = false;
      setData(function (prev) { return Object.assign({}, prev, { loading: true, error: null }); });
      D.loadConfig(window.fetch.bind(window), window.location.href).then(function (cfg) {
        if (!cfg.ok) return { config: null, reg: cfg };
        return load(cfg, 'registry', null, 0).then(function (reg) { return { config: cfg, reg: reg }; });
      }).then(function (r) {
        if (cancelled) return null;
        if (!r.reg.ok) {
          setData(function (prev) { return Object.assign({}, prev, { loading: false, error: r.reg.error }); });
          return null;
        }
        var registry = r.reg.payload;
        var id = wanted && L.findChallenge(registry, wanted) ? wanted : L.pickDefault(registry, L.todayInDubai(Date.now()));
        var d = id ? L.findChallenge(registry, id) : null;
        if (!d) {
          setData({ loading: false, registry: registry, payload: null, error: { kind: 'missing' } });
          return null;
        }
        setData(function (prev) {
          return { loading: true, registry: registry, payload: prev.payload && prev.payload.id === d.id ? prev.payload : null, error: null };
        });
        // A registry that had to come from the API means the copy failed: the challenge skips it too.
        return load(r.config, 'challenge', d.id, r.reg.source === 'api' ? null : d.csvGid).then(function (ch) {
          if (cancelled) return;
          setData(function (prev) {
            return ch.ok
              ? { loading: false, registry: registry, payload: ch.payload, error: null }
              : { loading: false, registry: registry, payload: prev.payload, error: ch.error };
          });
        });
      });
      return function () { cancelled = true; };
    }, [attempt]);
    return data;
  }

  // The settings of one challenge, saved in this browser on every change.
  function useDraft(id) {
    var s = useState(function () { return E.defaultSettings(); });
    var settings = s[0];
    var setSettings = s[1];
    useEffect(function () {
      if (id) setSettings(E.mergeSettings(store.get(DRAFT_PREFIX + id)));
    }, [id]);
    function update(next) {
      setSettings(next);
      if (id) store.set(DRAFT_PREFIX + id, next);
    }
    return [settings, update];
  }

  function blockDef(type) {
    return E.BLOCKS.filter(function (b) { return b.type === type; })[0];
  }

  function challengeOptions(registry) {
    var g = L.groupChallenges(registry, L.todayInDubai(Date.now()));
    return g.current.concat(g.past).map(function (c) {
      return html`<option key=${c.id} value=${c.id}>${c.name || c.id}</option>`;
    });
  }

  function App() {
    var w = useState(null);
    var wanted = w[0];
    var setWanted = w[1];
    var a = useState(0);
    var attempt = a[0];
    var setAttempt = a[1];
    var data = useData(wanted, attempt);
    var registry = data.registry;
    var id = registry ? (wanted && L.findChallenge(registry, wanted) ? wanted : L.pickDefault(registry, L.todayInDubai(Date.now()))) : null;
    var draft = useDraft(id);
    var settings = draft[0];
    var update = draft[1];
    var v = useState('desktop');
    var width = v[0];
    var setWidth = v[1];
    var m = useState('');
    var message = m[0];
    var setMessage = m[1];
    var frameRef = useRef(null);
    var ctx = registry && id ? E.buildContext(registry, data.payload, id, Date.now()) : null;
    var email = ctx ? E.buildEmail(settings, ctx) : '';
    var ready = !!(ctx && ctx.ready);

    useEffect(function () {
      if (!message) return undefined;
      var timer = setTimeout(function () { setMessage(''); }, 8000);
      return function () { clearTimeout(timer); };
    }, [message]);

    function fitFrame() {
      var f = frameRef.current;
      try {
        var doc = f && f.contentDocument;
        if (doc && doc.documentElement) f.style.height = doc.documentElement.scrollHeight + 'px';
      } catch (e) {
        // The preview keeps its last height.
      }
    }
    useEffect(fitFrame, [width]);

    function refresh() {
      setAttempt(function (n) { return n + 1; });
    }

    function pick(newId) {
      setWanted(newId);
      refresh();
    }

    // Fallback for browsers without ClipboardItem: select the preview and copy it.
    function copyFromPreview() {
      try {
        var f = frameRef.current;
        var doc = f && f.contentDocument;
        if (!doc || !doc.body) return false;
        var range = doc.createRange();
        range.selectNodeContents(doc.body);
        var sel = f.contentWindow.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        var ok = doc.execCommand('copy');
        sel.removeAllRanges();
        return ok;
      } catch (e) {
        return false;
      }
    }

    function copyRich() {
      var done = function () { setMessage('Copied. Paste it into a new Gmail message with Ctrl+V (Cmd+V on a Mac).'); };
      var fallback = function () {
        if (copyFromPreview()) done();
        else setMessage(COPY_FAILED);
      };
      if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
        var item = new ClipboardItem({
          'text/html': new Blob([email], { type: 'text/html' }),
          'text/plain': new Blob([E.buildPlainText(settings, ctx)], { type: 'text/plain' })
        });
        navigator.clipboard.write([item]).then(done, fallback);
      } else {
        fallback();
      }
    }

    function copyText(value, what) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(function () { setMessage(what + ' copied.'); }, function () { setMessage(COPY_FAILED); });
      } else {
        setMessage(COPY_FAILED);
      }
    }

    function download() {
      var url = URL.createObjectURL(new Blob([email], { type: 'text/html' }));
      var link = document.createElement('a');
      link.href = url;
      link.download = id + '-' + L.todayInDubai(Date.now()) + '.html';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    var status = data.error ? L.errorText(data.error)
      : data.loading ? 'Loading the latest numbers...'
        : ctx && ctx.values.asOf ? 'Numbers as of ' + ctx.values.asOf + ', Dubai time.' : '';

    return html`
      <div>
        <header className="top">
          <div className="top-inner">
            <h1>GLC email builder</h1>
            <p>Build a resident email from the live challenge numbers, then copy it into Gmail.</p>
          </div>
        </header>
        <div className="toolbar" role="toolbar" aria-label="Email actions">
          <button type="button" className="primary" disabled=${!ready} onClick=${copyRich}>Copy for Gmail</button>
          <button type="button" disabled=${!ready} onClick=${function () { copyText(email, 'HTML'); }}>Copy HTML</button>
          <button type="button" disabled=${!ready} onClick=${download}>Download .html</button>
          <button type="button" disabled=${data.loading} onClick=${refresh}>Refresh data</button>
          <p className="status">${status}${data.error ? html` <button type="button" className="link" onClick=${refresh}>Try again</button>` : null}</p>
          <p className="message" role="status">${message}</p>
        </div>
        <main className="layout">
          <section className="editor" aria-label="Email settings">
            <fieldset className="editor-fields" disabled=${!id}>
            ${registry ? html`
              <label className="field">
                <span>Challenge</span>
                <select value=${id || ''} onChange=${function (e) { pick(e.target.value); }}>${challengeOptions(registry)}</select>
              </label>` : null}
            <label className="field">
              <span>Theme</span>
              <select value=${settings.theme} onChange=${function (e) { update(E.setValue(settings, 'theme', e.target.value)); }}>
                ${E.THEMES.map(function (t) { return html`<option key=${t.key} value=${t.key}>${t.label}</option>`; })}
              </select>
            </label>
            <div className="field">
              <label htmlFor="subject">Subject</label>
              <div className="row">
                <input id="subject" type="text" value=${settings.subject} onChange=${function (e) { update(E.setValue(settings, 'subject', e.target.value)); }} />
                <button type="button" disabled=${!ctx} onClick=${function () { copyText(E.subjectLine(settings, ctx), 'Subject'); }}>Copy</button>
              </div>
              ${ctx ? html`<p className="hint">${E.subjectLine(settings, ctx)}</p>` : null}
            </div>
            <label className="field">
              <span>Hub link</span>
              <input type="url" value=${settings.hubUrl} onChange=${function (e) { update(E.setValue(settings, 'hubUrl', e.target.value)); }} />
            </label>
            <label className="check">
              <input type="checkbox" checked=${settings.showNames} onChange=${function (e) { update(E.setValue(settings, 'showNames', e.target.checked)); }} />
              Show student names in the top lists
            </label>
            <h2>Blocks</h2>
            <p className="hint">Placeholders you can type in any text: ${TOKENS}. A blank line starts a new paragraph. Put two stars on each side of words to make them bold, like **this**.</p>
            <ol className="blocks">
              ${settings.blocks.map(function (b, i) {
                var def = blockDef(b.type);
                return html`
                  <li key=${b.type} className=${b.on ? 'block' : 'block off'}>
                    <div className="block-head">
                      <label className="check">
                        <input type="checkbox" checked=${b.on} onChange=${function (e) { update(E.toggleBlock(settings, b.type, e.target.checked)); }} />
                        ${def.label}
                      </label>
                      <span className="moves">
                        <button type="button" aria-label=${'Move ' + def.label + ' up'} disabled=${i === 0} onClick=${function () { update(E.moveBlock(settings, b.type, -1)); }}>Up</button>
                        <button type="button" aria-label=${'Move ' + def.label + ' down'} disabled=${i === settings.blocks.length - 1} onClick=${function () { update(E.moveBlock(settings, b.type, 1)); }}>Down</button>
                      </span>
                    </div>
                    ${b.on ? def.fields.map(function (f) {
                      var fid = 'f-' + f.key;
                      var onChange = function (e) { update(E.setValue(settings, f.key, e.target.value)); };
                      return html`
                        <div key=${f.key} className="field">
                          <label htmlFor=${fid}>${f.label}</label>
                          ${f.long
                            ? html`<textarea id=${fid} rows="4" value=${settings.texts[f.key]} onChange=${onChange}></textarea>`
                            : html`<input id=${fid} type="text" value=${settings.texts[f.key]} onChange=${onChange} />`}
                        </div>`;
                    }) : null}
                    ${b.on && def.live ? html`<p className="hint">Filled from the live numbers.</p>` : null}
                  </li>`;
              })}
            </ol>
            <button type="button" className="reset" onClick=${function () { update(E.defaultSettings()); }}>Reset to template</button>
            </fieldset>
            <section className="howto" aria-labelledby="howto-title">
              <h2 id="howto-title">How to send it</h2>
              <ol>
                <li>Check the preview, then click <strong>Copy for Gmail</strong>.</li>
                <li>Open a new message in Gmail and paste with Ctrl+V (Cmd+V on a Mac).</li>
                <li>Copy the subject line into the message's subject.</li>
                <li>Send it to yourself first and check it on your phone, then send it to residents.</li>
              </ol>
            </section>
          </section>
          <section className="preview" aria-label="Preview">
            <div className="row">
              <h2>Preview</h2>
              <div role="group" aria-label="Preview width">
                <button type="button" aria-pressed=${width === 'desktop'} onClick=${function () { setWidth('desktop'); }}>Laptop</button>
                <button type="button" aria-pressed=${width === 'phone'} onClick=${function () { setWidth('phone'); }}>Phone</button>
              </div>
            </div>
            <div className="frame-box">
              ${email
                ? html`<iframe ref=${frameRef} title="Email preview" sandbox="allow-same-origin" srcDoc=${email} onLoad=${fitFrame}
                    style=${{ width: (width === 'phone' ? 360 : 600) + 'px' }}></iframe>`
                : html`<p className="empty">${data.error ? 'The preview needs the challenge list.' : 'Loading...'}</p>`}
            </div>
          </section>
        </main>
      </div>`;
  }

  ReactDOM.createRoot(rootEl).render(h(App));
})();
