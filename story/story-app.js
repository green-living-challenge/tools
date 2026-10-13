/* GLC tools: the story maker page. Reads the registry and one challenge like the hub does (GLC
   public first, the API second), plans today's stories with story-plan.js, draws them with
   story-draw.js, and shares or downloads the PNGs. Its WhatsApp tab (wa-panel.js) shows today's
   messages with the picture of the day, which is drawn here with wa-draw.js. Today's changes are
   kept in this browser for the day. Specs: docs/superpowers/specs/2026-10-12-story-maker-design.md
   and docs/superpowers/specs/2026-10-13-whatsapp-messages-design.md */
(function () {
  'use strict';

  var rootEl = document.getElementById('root');
  if (!window.React || !window.ReactDOM || !window.htm || !window.GLCLogic || !window.GLCData || !window.GLCStory ||
      !window.GLCStoryKit || !window.GLCStoryDraw || !window.GLCWhatsApp || !window.GLCWhatsAppDraw || !window.GLCWhatsAppPanel) {
    if (rootEl) rootEl.textContent = 'The story maker could not start. Reload the page.';
    return;
  }

  var h = React.createElement;
  var html = htm.bind(h);
  var L = window.GLCLogic;
  var D = window.GLCData;
  var S = window.GLCStory;
  var Kit = window.GLCStoryKit;
  var Draw = window.GLCStoryDraw;
  var Wa = window.GLCWhatsApp;
  var WaDraw = window.GLCWhatsAppDraw;
  var WaPanel = window.GLCWhatsAppPanel;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var useMemo = React.useMemo;
  var store = D.safeStorage(function () { return window.localStorage; });
  var DAY_PREFIX = 'glc-story:v1:day:';
  var NAMES_KEY = 'glc-story:v1:names';
  var FONTS_FAILED = 'The story fonts did not load. Check the connection and try again.';
  var SHARE_FAILED = 'Sharing did not work here. Use Download instead.';
  var DRAW_FAILED = 'The stories could not be made on this device. Reload the page, or try another browser.';
  var MAY_NOT_FIT = 'Part of this story may not fit. Shorten the headline, or swap or leave out this story.';
  var COPY_FAILED = 'Copying did not work in this browser. Select the text and copy it by hand.';

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

  // The registry with only the challenges that have a ranked leaderboard: stories show standings.
  function rankedOnly(registry) {
    return Object.assign({}, registry, {
      challenges: (registry.challenges || []).filter(function (c) { return c && c.leaderboard === 'ranked'; })
    });
  }

  function pickId(registry, wanted) {
    return wanted && L.findChallenge(registry, wanted) ? wanted : L.pickDefault(registry, L.todayInDubai(Date.now()));
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
        var registry = rankedOnly(r.reg.payload);
        var d = L.findChallenge(registry, pickId(registry, wanted));
        if (!d) {
          setData({ loading: false, registry: registry, payload: null, error: { kind: 'none' } });
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

  // null while loading, then true or false. attempt: changes to try again.
  function useFonts(attempt) {
    var s = useState(null);
    useEffect(function () {
      var cancelled = false;
      s[1](null);
      Kit.loadFonts().then(function (ok) { if (!cancelled) s[1](ok); });
      return function () { cancelled = true; };
    }, [attempt]);
    return s[0];
  }

  // Removes the saved days of this challenge other than today's.
  function forgetOtherDays(id, today) {
    try {
      var ls = window.localStorage;
      var prefix = DAY_PREFIX + id + ':';
      var drop = [];
      for (var i = 0; i < ls.length; i++) {
        var key = ls.key(i);
        if (key && key.indexOf(prefix) === 0 && key !== prefix + today) drop.push(key);
      }
      drop.forEach(function (key) { ls.removeItem(key); });
    } catch (e) {
      // Storage blocked: nothing was saved.
    }
  }

  // Today's changes for one challenge, saved in this browser on every change.
  function useDay(id, today) {
    var s = useState(S.emptyDayState());
    var day = s[0];
    var setDay = s[1];
    useEffect(function () {
      if (!id) return;
      forgetOtherDays(id, today);
      setDay(S.mergeDayState(store.get(DAY_PREFIX + id + ':' + today)));
    }, [id, today]);
    function update(next) {
      var clean = S.mergeDayState(next);
      setDay(clean);
      if (id) store.set(DAY_PREFIX + id + ':' + today, clean);
    }
    return [day, update];
  }

  function typeLabel(facts, type) {
    if (type === 'top' && facts) return facts.topLabel;
    var t = S.TYPES.filter(function (x) { return x.key === type; })[0];
    return t ? t.label : type;
  }

  // Draws each item (a story or the WhatsApp picture: { key, name, draw(canvas) -> problems }) once
  // per content and keeps its PNG: { images: { [key]: { url, file, problems } }, failed }. Only the
  // items whose content changed are drawn again; images no longer used are let go. failed: an
  // image could not be made (a canvas the device refused, for example).
  function useImages(items, enabled) {
    var s = useState({ images: {}, failed: false });
    var setState = s[1];
    var cache = useRef({});
    var signature = items.map(function (it) { return it.key; }).join('\n');
    useEffect(function () {
      if (!enabled) return undefined;
      var cancelled = false;
      var chain = Promise.resolve();
      items.forEach(function (it) {
        chain = chain.then(function () {
          if (cancelled || cache.current[it.key]) return null;
          var canvas = document.createElement('canvas');
          var problems = it.draw(canvas);
          // A canvas holds about 8 MB until it is emptied; phones cap the total.
          var release = function () { canvas.width = 0; canvas.height = 0; };
          return Kit.toBlob(canvas).then(function (blob) {
            release();
            cache.current[it.key] = { url: URL.createObjectURL(blob), file: new File([blob], it.name, { type: 'image/png' }), problems: problems };
          }, function (e) {
            release();
            throw e;
          });
        });
      });
      chain.then(function () {
        if (cancelled) return;
        var keep = {};
        items.forEach(function (it) { keep[it.key] = cache.current[it.key]; });
        Object.keys(cache.current).forEach(function (key) {
          if (!keep[key]) {
            URL.revokeObjectURL(cache.current[key].url);
            delete cache.current[key];
          }
        });
        setState({ images: keep, failed: false });
      }, function () {
        if (!cancelled) setState(function (prev) { return { images: prev.images, failed: true }; });
      });
      return function () { cancelled = true; };
    }, [signature, enabled]);
    return s[0];
  }

  // The phone's share sheet with these files: 'shared', 'cancelled', 'failed' or 'unsupported'.
  // Called straight from the tap, because iPhone Safari refuses a share that waits.
  function shareFiles(files) {
    var data = { files: files };
    var can = false;
    try {
      can = !!(navigator.canShare && navigator.share && navigator.canShare(data));
    } catch (e) {
      can = false;
    }
    if (!can) return Promise.resolve('unsupported');
    return navigator.share(data).then(function () { return 'shared'; }, function (e) {
      return e && e.name === 'AbortError' ? 'cancelled' : 'failed';
    });
  }

  function downloadFile(file) {
    var url = URL.createObjectURL(file);
    var link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function challengeOptions(registry) {
    var g = L.groupChallenges(registry, L.todayInDubai(Date.now()));
    return g.current.concat(g.past).map(function (c) {
      return html`<option key=${c.id} value=${c.id}>${c.name || c.id}</option>`;
    });
  }

  // 'whatsapp' when the address asks for the WhatsApp tab (#whatsapp), else 'instagram'.
  function tabFromHash() {
    return window.location.hash === '#whatsapp' ? 'whatsapp' : 'instagram';
  }

  function App() {
    var w = useState(null);
    var wanted = w[0];
    var setWanted = w[1];
    var a = useState(0);
    var attempt = a[0];
    var setAttempt = a[1];
    var fa = useState(0);
    var fontAttempt = fa[0];
    var setFontAttempt = fa[1];
    var data = useData(wanted, attempt);
    var fontsOk = useFonts(fontAttempt);
    var registry = data.registry;
    var id = registry ? pickId(registry, wanted) : null;
    var today = L.todayInDubai(Date.now());
    var dayState = useDay(id, today);
    var day = dayState[0];
    var updateDay = dayState[1];
    var n = useState(function () {
      var saved = store.get(NAMES_KEY);
      return S.NAME_MODES.some(function (m) { return m.key === saved; }) ? saved : 'initial';
    });
    var names = n[0];
    var setNames = n[1];
    var m = useState('');
    var message = m[0];
    var setMessage = m[1];
    var v = useState(-1);
    var viewing = v[0];
    var setViewing = v[1];
    var tb = useState(tabFromHash);
    var tab = tb[0];
    var setTab = tb[1];

    var facts = useMemo(function () {
      return registry && id ? S.buildFacts(registry, data.payload, id, Date.now()) : null;
    }, [registry, data.payload, id]);
    var plan = facts ? S.planDay(facts, day) : null;
    var ready = !!(facts && facts.ready);
    var items = [];
    if (plan && ready) {
      plan.stories.forEach(function (st, i) {
        if (!st.on) return;
        var content = S.storyContent(facts, st, { look: plan.look, names: names });
        if (!content) return;
        items.push({
          slot: st.slot, key: JSON.stringify([names, content]), content: content, name: S.fileName(facts.id, today, i + 1, st.type),
          draw: function (canvas) { return Draw.draw(canvas, content); }
        });
      });
    }
    // The WhatsApp picture of the day, drawn with the stories whichever tab is open.
    var picture = plan && ready ? Wa.pictureOfDay(facts, plan, day) : null;
    var card = picture ? Wa.cardContent(facts, plan, picture.chosen, { look: plan.look, names: names }) : null;
    var cardItem = card ? {
      key: 'wa:' + JSON.stringify([names, card]), name: Wa.fileName(facts.id, today, picture.chosen),
      draw: function (canvas) { return WaDraw.draw(canvas, card); }
    } : null;
    var link = registry && id ? Wa.hubLink(id, registry.defaultId) : Wa.HUB_LINK;
    var made = useImages(items, ready && fontsOk === true);
    // The picture is drawn apart from the stories, and only on the WhatsApp tab, so the stories
    // never wait for it or fail with it.
    var madeCard = useImages(cardItem ? [cardItem] : [], ready && fontsOk === true && tab === 'whatsapp');
    var images = made.images;
    var drawn = items.filter(function (it) { return images[it.key]; });
    var allDrawn = items.length > 0 && drawn.length === items.length;
    var cardImage = cardItem ? madeCard.images[cardItem.key] || null : null;

    useEffect(function () {
      if (!message) return undefined;
      var timer = setTimeout(function () { setMessage(''); }, 8000);
      return function () { clearTimeout(timer); };
    }, [message]);

    useEffect(function () {
      if (viewing < 0) return undefined;
      var onKey = function (e) { if (e.key === 'Escape') setViewing(-1); };
      window.addEventListener('keydown', onKey);
      return function () { window.removeEventListener('keydown', onKey); };
    }, [viewing]);

    useEffect(function () {
      var onHash = function () { setTab(tabFromHash()); };
      window.addEventListener('hashchange', onHash);
      return function () { window.removeEventListener('hashchange', onHash); };
    }, []);

    function pickTab(next) {
      setTab(next);
      try {
        window.history.replaceState(null, '', next === 'whatsapp' ? '#whatsapp' : window.location.pathname + window.location.search);
      } catch (e) {
        // An address that cannot be changed: the tab still switches.
      }
    }

    function refresh() {
      setAttempt(function (x) { return x + 1; });
    }

    function pick(newId) {
      setWanted(newId);
      refresh();
    }

    function pickNames(value) {
      setNames(value);
      store.set(NAMES_KEY, value);
    }

    function itemFor(slot) {
      return items.filter(function (it) { return it.slot === slot; })[0] || null;
    }

    function share(files) {
      shareFiles(files).then(function (result) {
        if (result === 'unsupported') files.forEach(function (f, i) { setTimeout(function () { downloadFile(f); }, i * 400); });
        else if (result === 'failed') setMessage(SHARE_FAILED);
      });
    }

    function downloadAll() {
      drawn.forEach(function (it, i) { setTimeout(function () { downloadFile(images[it.key].file); }, i * 400); });
    }

    function copyText(value, what) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(function () { setMessage(what + ' copied.'); }, function () { setMessage(COPY_FAILED); });
      } else {
        setMessage(COPY_FAILED);
      }
    }

    var poll = null;
    items.forEach(function (it) { poll = poll || S.pollHelper(it.content); });

    var dayLine = '';
    if (facts && facts.count && plan) {
      if (plan.state === 'live') dayLine = 'Day ' + facts.count.day + ' of ' + facts.count.days;
      else if (plan.state === 'finish') dayLine = 'Finished ' + S.longDay(facts.endDate);
      if (facts.asOfLong) dayLine += ', standings as of ' + facts.asOfLong + ' (Dubai time)';
    }
    var status = data.error ? (data.error.kind === 'none' ? 'There is no challenge with a leaderboard to make stories for.' : L.errorText(data.error))
      : fontsOk === false ? FONTS_FAILED
        : made.failed ? DRAW_FAILED
          : data.loading ? 'Loading the latest numbers...'
          : fontsOk === null ? 'Loading the story fonts...' : '';
    var canAct = allDrawn && fontsOk === true;

    function storyCard(st, i) {
      var it = st.on ? itemFor(st.slot) : null;
      var img = it ? images[it.key] : null;
      var label = (i + 1) + '. ' + typeLabel(facts, st.type);
      var placeholder = !st.on ? 'Left out of today’s set.' : ready && !it ? 'No data for this story yet.' : 'Drawing...';
      return html`
        <li key=${st.slot} className=${st.on ? 'story' : 'story off'}>
          ${img
            ? html`<button type="button" className="thumb" aria-label=${'Open story ' + (i + 1) + ' full screen'} onClick=${function () { setViewing(st.slot); }}>
                <img src=${img.url} alt=${'Story ' + label} width="1080" height="1920" />
              </button>`
            : html`<div className="placeholder">${placeholder}</div>`}
          <h3>${label}</h3>
          ${img && img.problems.length ? html`<p className="warn">${MAY_NOT_FIT}</p>` : null}
          <label className="field">
            <span>Story</span>
            <select value=${st.type} onChange=${function (e) { updateDay(S.setSlot(day, st.slot, { type: e.target.value })); }}>
              ${st.options.map(function (t) { return html`<option key=${t} value=${t}>${typeLabel(facts, t)}${t === st.auto ? ' (today’s pick)' : ''}</option>`; })}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked=${st.on} onChange=${function (e) { updateDay(S.setSlot(day, st.slot, { on: e.target.checked })); }} />
            In today's set
          </label>
          <label className="field">
            <span>Headline</span>
            <input type="text" maxLength="80" value=${st.headline} placeholder=${S.defaultHeadline(facts, st)}
              onChange=${function (e) { updateDay(S.setSlot(day, st.slot, { headline: e.target.value })); }} />
          </label>
          <div className="row">
            <button type="button" className="primary" disabled=${!img || !canAct} onClick=${function () { share([img.file]); }}>Share</button>
            <button type="button" disabled=${!img || !canAct} onClick=${function () { downloadFile(img.file); }}>Download</button>
          </div>
        </li>`;
    }

    var viewed = viewing >= 0 ? itemFor(viewing) : null;
    var viewedImg = viewed ? images[viewed.key] : null;

    return html`
      <div>
        <header className="top">
          <div className="top-inner">
            <h1>GLC story maker</h1>
            <p>Today's Instagram stories and WhatsApp messages from the live challenge numbers, ready to share.</p>
          </div>
        </header>
        <div className="tabs" role="tablist" aria-label="Where to post">
          <button type="button" role="tab" className="tab" aria-selected=${tab === 'instagram'} onClick=${function () { pickTab('instagram'); }}>Instagram</button>
          <button type="button" role="tab" className="tab" aria-selected=${tab === 'whatsapp'} onClick=${function () { pickTab('whatsapp'); }}>WhatsApp</button>
        </div>
        <div className="toolbar" role="toolbar" aria-label="Story actions">
          ${tab === 'instagram' ? html`
            <button type="button" className="primary" disabled=${!canAct} onClick=${function () { share(drawn.map(function (it) { return images[it.key].file; })); }}>Share all</button>
            <button type="button" disabled=${!canAct} onClick=${downloadAll}>Download all</button>` : null}
          <button type="button" disabled=${!plan || !plan.stories.length} onClick=${function () { updateDay(S.shuffleDay(day)); }}>Shuffle</button>
          <button type="button" disabled=${!plan || !plan.stories.length} onClick=${function () { updateDay(S.emptyDayState()); }}>Reset today</button>
          <button type="button" disabled=${data.loading} onClick=${refresh}>Refresh data</button>
          <p className="status">${status}${data.error && data.error.kind !== 'none' ? html` <button type="button" className="link" onClick=${refresh}>Try again</button>` : null}${fontsOk === false ? html` <button type="button" className="link" onClick=${function () { setFontAttempt(function (x) { return x + 1; }); }}>Try again</button>` : null}</p>
          <p className="message" role="status">${message}</p>
        </div>
        <main className="layout">
          <fieldset className="settings" disabled=${!id}>
            ${registry ? html`
              <label className="field">
                <span>Challenge</span>
                <select value=${id || ''} onChange=${function (e) { pick(e.target.value); }}>${challengeOptions(registry)}</select>
              </label>` : null}
            <label className="field">
              <span>Look</span>
              <select value=${plan ? plan.look : 'journal'} onChange=${function (e) { updateDay(S.setLook(day, e.target.value)); }}>
                ${S.LOOKS.map(function (l) { return html`<option key=${l.key} value=${l.key}>${l.label}${plan && l.key === plan.autoLook ? ' (today’s pick)' : ''}</option>`; })}
              </select>
            </label>
            <label className="field">
              <span>Names in the top lists</span>
              <select value=${names} onChange=${function (e) { pickNames(e.target.value); }}>
                ${S.NAME_MODES.map(function (x) { return html`<option key=${x.key} value=${x.key}>${x.label}</option>`; })}
              </select>
            </label>
            ${dayLine ? html`<p className="day-line">${dayLine}</p>` : null}
          </fieldset>
          ${tab === 'whatsapp' ? html`
            <${WaPanel} facts=${facts} plan=${plan} day=${day} updateDay=${updateDay} names=${names} link=${link}
              picture=${picture} image=${cardImage} imageFailed=${madeCard.failed} canShare=${fontsOk === true} shareFiles=${shareFiles}
              downloadFile=${downloadFile} setMessage=${setMessage} />` : null}
          ${tab === 'instagram' && plan && plan.state === 'before' && facts ? html`<p className="empty">Stories begin on ${S.longDay(facts.startDate)}, the first day of the challenge.</p>` : null}
          ${tab === 'instagram' && plan && plan.stories.length ? html`<ol className="stories" aria-label="Today's stories">${plan.stories.map(storyCard)}</ol>` : null}
          ${tab === 'instagram' ? html`<section className="helpers" aria-labelledby="helpers-title">
            <h2 id="helpers-title">Posting</h2>
            <ol>
              <li>Post the stories in order, starting with 1.</li>
              <li>On the last story, add Instagram's link sticker where the arrow points, with this link:
                <span className="row link-row"><code>${S.HUB_LINK}</code><button type="button" onClick=${function () { copyText(S.HUB_LINK, 'Link'); }}>Copy</button></span></li>
              <li>To post several at once, use Share all (or Download all) to save them to Photos, then pick them in order in Instagram's story gallery.</li>
            </ol>
            ${poll ? html`
              <div className="poll">
                <h3>Poll sticker</h3>
                <p>Put Instagram's poll sticker in the empty space of the poll story, with:</p>
                <p className="row"><span>${poll.question}</span><button type="button" onClick=${function () { copyText(poll.question, 'Question'); }}>Copy</button></p>
                ${poll.options.map(function (o) { return html`<p key=${o} className="row"><span>${o}</span><button type="button" onClick=${function () { copyText(o, 'Option'); }}>Copy</button></p>`; })}
              </div>` : null}
          </section>` : null}
        </main>
        ${viewedImg ? html`
          <div className="viewer" role="dialog" aria-modal="true" aria-label="Story full screen" onClick=${function () { setViewing(-1); }}>
            <img src=${viewedImg.url} alt="Story full screen" />
            <button type="button" onClick=${function () { setViewing(-1); }}>Close</button>
          </div>` : null}
      </div>`;
  }

  ReactDOM.createRoot(rootEl).render(h(App));
})();
