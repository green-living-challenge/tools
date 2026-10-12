/* GLC tools: the email builder's logic. Pure: settings and challenge data in, one email out.
   No DOM, no network, no storage. Loaded in the browser as window.GLCEmail, after hub-logic.js,
   and in Node with require(). Spec: docs/superpowers/specs/2026-10-12-email-builder-design.md.
   Sections are added in order by the plan's tasks 1, 2 and 3. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../hub/hub-logic.js'));
  } else {
    root.GLCEmail = factory(root.GLCLogic);
  }
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';

  var api = {};

  // ---------- section A: text, tokens, dates, themes, settings ----------

  var TIMEZONE = 'Asia/Dubai';
  var HUB_URL = 'https://green-living-challenge.github.io/leaderboard/';
  var IMG_BASE = 'https://green-living-challenge.github.io/tools/email/img/';
  var FONT = 'Arial, Helvetica, sans-serif';
  var WHITE = '#FFFFFF';
  var LIGHT_HEADER_FALLBACK = '#1F2937';
  var DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var TOKEN_RE = /\{([A-Za-z]+)\}/g;
  var BOLD_RE = /\*\*([^*\n]+?)\*\*/g;
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function text(v) {
    return typeof v === 'string' ? v.trim() : '';
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // '{name}' -> values.name when that is a string or a finite number. Anything else, including
  // a token the values do not have, is left as typed, so a typo shows in the preview.
  function fillTokens(s, values) {
    var v = isObject(values) ? values : {};
    return String(s == null ? '' : s).replace(TOKEN_RE, function (match, name) {
      if (!Object.prototype.hasOwnProperty.call(v, name)) return match;
      var x = v[name];
      if (typeof x === 'string') return x;
      if (typeof x === 'number' && isFinite(x)) return String(x);
      return match;
    });
  }

  // Editor text -> an array of HTML paragraph bodies. The text is escaped first, then the tokens
  // are filled with escaped values, then **bold** becomes <strong>. A blank line starts a
  // paragraph and a single line break becomes <br>.
  function paragraphs(s, values) {
    var v = isObject(values) ? values : {};
    var safe = {};
    Object.keys(v).forEach(function (k) {
      if (typeof v[k] === 'string' || (typeof v[k] === 'number' && isFinite(v[k]))) safe[k] = escapeHtml(v[k]);
    });
    var source = String(s == null ? '' : s).replace(/\r\n?/g, '\n');
    return fillTokens(escapeHtml(source), safe).split(/\n[ \t]*\n/).map(function (para) {
      return para.trim();
    }).filter(Boolean).map(function (para) {
      return para.replace(BOLD_RE, '<strong>$1</strong>').replace(/[ \t]*\n[ \t]*/g, '<br>');
    });
  }

  // Editor text -> <p> elements with the given inline style. '' when the text is empty.
  function renderText(s, values, pStyle) {
    return paragraphs(s, values).map(function (body) {
      return '<p style="' + pStyle + '">' + body + '</p>';
    }).join('');
  }

  // The same for a title or a heading: no <p>.
  function renderInline(s, values) {
    return paragraphs(s, values).join('<br><br>');
  }

  // Editor text -> plain text: tokens filled, ** markers removed, ends trimmed.
  function plainFill(s, values) {
    return fillTokens(String(s == null ? '' : s).replace(/\r\n?/g, '\n'), values).replace(BOLD_RE, '$1').trim();
  }

  // 'YYYY-MM-DD' -> whole days since 1 January 1970, or NaN.
  function dayNumber(day) {
    var m = DAY_RE.exec(typeof day === 'string' ? day : '');
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : NaN;
  }

  // Week 1 is the start date and the six days after it. Never below 1. null without both days.
  function weekNumber(startDate, today) {
    var s = dayNumber(startDate);
    var t = dayNumber(today);
    if (!isFinite(s) || !isFinite(t)) return null;
    return Math.max(1, Math.floor((t - s) / 7) + 1);
  }

  // Days to the end date counting today, 0 once it has passed. null without both days.
  function daysLeft(endDate, today) {
    var e = dayNumber(endDate);
    var t = dayNumber(today);
    if (!isFinite(e) || !isFinite(t)) return null;
    return Math.max(0, e - t + 1);
  }

  // '2026-10-31' -> 'Saturday 31 October'. '' when unreadable.
  function longDay(day) {
    var n = dayNumber(day);
    if (!isFinite(n)) return '';
    var m = DAY_RE.exec(day);
    return WEEKDAYS[new Date(n * 86400000).getUTCDay()] + ' ' + Number(m[3]) + ' ' + MONTH_NAMES[Number(m[2]) - 1];
  }

  var stampFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true
  });

  // ISO time -> 'Monday 12 October, 5:15 PM' in Dubai time. '' when unreadable.
  function longStamp(iso) {
    var ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (!isFinite(ms)) return '';
    var p = {};
    stampFormat.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return p.weekday + ' ' + p.day + ' ' + p.month + ', ' + p.hour + ':' + p.minute + ' ' + String(p.dayPeriod).toUpperCase();
  }

  var THEMES = [
    { key: 'challenge', label: "The challenge's colours" },
    { key: 'maroon', label: 'GLC maroon and cream' },
    { key: 'teal', label: 'Sustainability teal' }
  ];
  var FIXED_THEMES = {
    maroon: { headerFrom: '#4A1526', accent: '#E8C9A8', page: '#F5F0E8', ink: '#4A1526' },
    teal: { headerFrom: '#06415C', accent: '#1E988A', page: '#EEF6F5', ink: '#06415C' }
  };

  // The colours of one email. key: a THEMES key (an unknown one means 'challenge');
  // challengeTheme: the challenge descriptor's theme. Missing colours fall back as in the hub.
  // The logos are white, so a header colour that needs dark text is replaced by a dark grey.
  function themeColors(key, challengeTheme) {
    var v = L.themeVars(FIXED_THEMES[key] || challengeTheme);
    var from = v['--glc-from'];
    var header = L.readableTextOn(from) === WHITE ? from : LIGHT_HEADER_FALLBACK;
    var accent = v['--glc-accent'];
    return {
      header: header,
      onHeader: WHITE,
      kicker: L.contrastRatio(accent, header) >= 4.5 ? accent : WHITE,
      page: v['--glc-page'],
      ink: v['--glc-ink'],
      muted: v['--glc-muted'],
      line: v['--glc-line'],
      accent: accent,
      onAccent: L.readableTextOn(accent)
    };
  }

  var BLOCKS = [
    { type: 'header', label: 'Header', fields: [{ key: 'title', label: 'Title' }, { key: 'subtitle', label: 'Subtitle' }] },
    { type: 'intro', label: 'Greeting and intro', fields: [{ key: 'intro', label: 'Text', long: true }] },
    { type: 'stats', label: 'Stat tiles', live: true, fields: [] },
    { type: 'race', label: 'Hall race', live: true, fields: [] },
    { type: 'top', label: 'Top walkers', live: true, fields: [] },
    { type: 'reminder', label: 'Reminder', fields: [{ key: 'reminderHeading', label: 'Heading' }, { key: 'reminder', label: 'Text', long: true }] },
    { type: 'prizes', label: 'Prizes', fields: [{ key: 'prizesHeading', label: 'Heading' }, { key: 'prizes', label: 'Text', long: true }] },
    { type: 'hub', label: 'Hub button', fields: [{ key: 'hubText', label: 'Text', long: true }] },
    { type: 'whatsapp', label: 'WhatsApp community', fields: [{ key: 'whatsapp', label: 'Text', long: true }] },
    { type: 'signoff', label: 'Sign-off', fields: [{ key: 'signoff', label: 'Text', long: true }] },
    { type: 'footer', label: 'Footer', fields: [{ key: 'footer', label: 'Text' }] }
  ];
  var BLOCK_TYPES = BLOCKS.map(function (b) { return b.type; });

  var DEFAULT_TEXTS = {
    title: '{challenge}: week {week} update',
    subtitle: '{tagline}',
    intro: 'Dear Residents,\n\n{participants} residents have logged {total} {unit} so far. There are {daysLeft} left to push your hall further.',
    reminderHeading: 'Keep it going',
    reminder: '**Track** your {unit} every day.\n**Log** them once a day on the form, with a screenshot as proof.\n**Deadline:** the challenge ends on {endDate}.',
    prizesHeading: 'What you can win',
    prizes: '{prizes}',
    hubText: 'See every hall and every participant on the live leaderboard, updated through the day.',
    whatsapp: 'Join the GLC WhatsApp community for reminders, results and event news.',
    signoff: 'Best regards,\n**Student Residential Life Department**\nIn collaboration with the Office of Sustainability',
    footer: 'American University of Sharjah, Student Residential Life, Office of Sustainability'
  };
  var DEFAULT_SUBJECT = '{challenge}: week {week} standings';

  function defaultSettings() {
    return {
      version: 1,
      theme: 'challenge',
      subject: DEFAULT_SUBJECT,
      hubUrl: HUB_URL,
      showNames: true,
      blocks: BLOCK_TYPES.map(function (type) { return { type: type, on: true }; }),
      texts: Object.assign({}, DEFAULT_TEXTS)
    };
  }

  function indexOfType(blocks, type) {
    for (var i = 0; i < blocks.length; i++) if (blocks[i].type === type) return i;
    return -1;
  }

  // A saved draft of any shape (an older page, a broken value, null) -> complete settings.
  // Unknown and repeated blocks are dropped; a missing block is put back after the nearest
  // earlier block of the default order; every value of the wrong type takes its default.
  function mergeSettings(saved) {
    var d = defaultSettings();
    if (!isObject(saved)) return d;
    var blocks = [];
    (Array.isArray(saved.blocks) ? saved.blocks : []).forEach(function (b) {
      if (!isObject(b) || BLOCK_TYPES.indexOf(b.type) < 0 || indexOfType(blocks, b.type) >= 0) return;
      blocks.push({ type: b.type, on: b.on !== false });
    });
    BLOCK_TYPES.forEach(function (type, i) {
      if (indexOfType(blocks, type) >= 0) return;
      var at = 0;
      for (var j = i - 1; j >= 0; j--) {
        var k = indexOfType(blocks, BLOCK_TYPES[j]);
        if (k >= 0) {
          at = k + 1;
          break;
        }
      }
      blocks.splice(at, 0, { type: type, on: true });
    });
    var texts = {};
    Object.keys(DEFAULT_TEXTS).forEach(function (k) {
      texts[k] = isObject(saved.texts) && typeof saved.texts[k] === 'string' ? saved.texts[k] : DEFAULT_TEXTS[k];
    });
    return {
      version: 1,
      theme: THEMES.some(function (t) { return t.key === saved.theme; }) ? saved.theme : d.theme,
      subject: typeof saved.subject === 'string' ? saved.subject : d.subject,
      hubUrl: typeof saved.hubUrl === 'string' ? saved.hubUrl : d.hubUrl,
      showNames: typeof saved.showNames === 'boolean' ? saved.showNames : d.showNames,
      blocks: blocks,
      texts: texts
    };
  }

  // New settings with one block moved by step (-1 up, +1 down). Unchanged at either end.
  function moveBlock(settings, type, step) {
    var s = mergeSettings(settings);
    var i = indexOfType(s.blocks, type);
    var j = i + step;
    if (i < 0 || j < 0 || j >= s.blocks.length) return s;
    var b = s.blocks[i];
    s.blocks[i] = s.blocks[j];
    s.blocks[j] = b;
    return s;
  }

  function toggleBlock(settings, type, on) {
    var s = mergeSettings(settings);
    s.blocks = s.blocks.map(function (b) { return b.type === type ? { type: b.type, on: !!on } : b; });
    return s;
  }

  // New settings with one value changed: a text key, or 'theme', 'subject', 'hubUrl', 'showNames'.
  function setValue(settings, key, value) {
    var s = mergeSettings(settings);
    if (Object.prototype.hasOwnProperty.call(DEFAULT_TEXTS, key)) s.texts[key] = String(value);
    else if (key === 'theme' || key === 'subject' || key === 'hubUrl') s[key] = String(value);
    else if (key === 'showNames') s.showNames = !!value;
    return mergeSettings(s);
  }

  Object.assign(api, {
    HUB_URL: HUB_URL,
    IMG_BASE: IMG_BASE,
    FONT: FONT,
    THEMES: THEMES,
    BLOCKS: BLOCKS,
    DEFAULT_TEXTS: DEFAULT_TEXTS,
    escapeHtml: escapeHtml,
    fillTokens: fillTokens,
    renderText: renderText,
    renderInline: renderInline,
    plainFill: plainFill,
    weekNumber: weekNumber,
    daysLeft: daysLeft,
    longDay: longDay,
    longStamp: longStamp,
    themeColors: themeColors,
    defaultSettings: defaultSettings,
    mergeSettings: mergeSettings,
    moveBlock: moveBlock,
    toggleBlock: toggleBlock,
    setValue: setValue
  });

  // ---------- section B: the challenge data an email shows ----------

  var PROGRAM_NAME = 'Green Living Challenge';

  function capitalise(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // Only https links go into an email (spec section 2). null for anything else.
  function httpsUrl(u) {
    var s = text(u);
    return /^https:\/\//i.test(s) && L.safeUrl(s) ? s : null;
  }

  // Registry + challenge payload -> everything the blocks need, or null when the registry does
  // not list the challenge. payload may be null (not loaded yet) or another challenge's: ready
  // is then false and the tokens that need numbers are left out, so they stay as typed.
  function buildContext(registry, payload, challengeId, nowMs) {
    var d = L.findChallenge(registry, challengeId);
    if (!d) return null;
    var program = isObject(registry.program) ? registry.program : {};
    var programName = text(program.name) || PROGRAM_NAME;
    var p = isObject(payload) && payload.id === d.id && isObject(payload.totals) ? payload : null;
    var today = L.todayInDubai(nowMs);
    var state = L.deriveState(d, today, !!(p && p.final === true));
    var unit = L.unitLabel(d);
    var groups = d.divisions === true ? L.divisionsFor(registry.halls) : [];
    var sections = (groups.length ? groups : [{ key: '', label: '' }]).map(function (g) {
      var v = L.challengeView(d, p, registry, nowMs, g.key, programName);
      return {
        key: g.key,
        label: g.label,
        halls: v.route ? v.route.cards : v.halls.map(function (h) { return Object.assign({}, h, { position: null, text: '' }); }),
        maxHallPoints: v.maxHallPoints,
        top: v.rows.slice(0, 3)
      };
    });
    var totals = p ? p.totals : {};
    var week = weekNumber(d.startDate, today);
    var left = daysLeft(d.endDate, today);
    var values = { challenge: text(d.name) || 'Challenge', unit: unit, tagline: text(d.tagline), prizes: text(d.prizes) };
    if (longDay(d.endDate)) values.endDate = longDay(d.endDate);
    if (week !== null) values.week = week;
    if (left !== null) values.daysLeft = L.daysText(left);
    if (p) {
      values.participants = L.formatNumber(totals.participants);
      values.total = L.formatNumber(totals.points);
      if (longStamp(p.updatedAt)) values.asOf = longStamp(p.updatedAt);
    }
    var form = L.submitLink(d, state);
    return {
      ready: !!p,
      id: d.id,
      programName: programName,
      unit: unit,
      state: state,
      theme: d.theme,
      stops: L.routeMilestones(d),
      sections: sections,
      stats: p ? [
        { label: 'Participants', value: L.formatNumber(totals.participants) },
        { label: capitalise(L.unitWord(unit, 2)), value: L.formatNumber(totals.points) },
        { label: 'Days left', value: left === null ? '' : L.formatNumber(left) }
      ] : [],
      form: form && httpsUrl(form.url) ? { url: httpsUrl(form.url), label: form.label } : null,
      whatsappUrl: httpsUrl(program.whatsappUrl),
      values: values
    };
  }

  Object.assign(api, {
    buildContext: buildContext
  });

  // ---------- section C: the email document and its plain text ----------

  var LOGOS = [
    { key: 'aus', file: 'aus-sustainability-white.png', alt: 'AUS Sustainability', width: 137, height: 36, align: 'left' },
    { key: 'srl', file: 'srl-white.png', alt: 'Student Residential Life', width: 77, height: 36, align: 'right' }
  ];
  var LIVE = { stats: true, race: true, top: true };
  var TEXT = '#333333';
  var SOFT = '#4B5563';
  var NOTE = '#6B7280';
  var GREY_BOX = '#F3F4F6';

  function font(size, extra) {
    return 'font-family:' + FONT + ';font-size:' + size + 'px;' + (extra || '');
  }

  var BODY = 'margin:0 0 14px 0;' + font(15, 'line-height:1.6;color:' + TEXT + ';');

  function layout(attrs, rowsHtml) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"' + (attrs || '') + '>' + rowsHtml + '</table>';
  }

  function fill(color) {
    return ' bgcolor="' + color + '"';
  }

  // One row of the card, its content padded.
  function section(inner, padding) {
    return '<tr><td style="padding:' + padding + ';">' + inner + '</td></tr>';
  }

  function heading(innerHtml, c) {
    return '<h2 style="margin:0 0 12px 0;' + font(17, 'line-height:1.3;font-weight:bold;color:' + c.ink + ';border-bottom:2px solid ' + c.header + ';padding-bottom:8px;') + '">' + innerHtml + '</h2>';
  }

  function subheading(label, c) {
    return '<h3 style="margin:18px 0 10px 0;' + font(12, 'line-height:1.3;letter-spacing:1px;text-transform:uppercase;font-weight:bold;color:' + c.muted + ';') + '">' + escapeHtml(label) + '</h3>';
  }

  function note(innerHtml) {
    return '<p style="margin:0 0 10px 0;' + font(13, 'line-height:1.5;color:' + SOFT + ';') + '">' + innerHtml + '</p>';
  }

  function badge(code, color, onColor) {
    return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;' + font(12, 'line-height:1.4;font-weight:bold;background-color:' + color + ';color:' + onColor + ';') + '">' + escapeHtml(code) + '</span>';
  }

  function amount(n, unit, c) {
    return L.formatNumber(n) + ' <span style="' + font(12, 'font-weight:normal;color:' + c.muted + ';') + '">' + escapeHtml(L.unitWord(unit, n)) + '</span>';
  }

  // A button: a coloured cell holding the link, which every mail app draws.
  function button(url, label, bg, fg, center) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0"' + (center ? ' align="center"' : '') + '><tr>' +
      '<td' + fill(bg) + ' style="background-color:' + bg + ';border-radius:8px;">' +
      '<a href="' + escapeHtml(url) + '" target="_blank" style="display:inline-block;padding:12px 26px;' + font(15, 'line-height:1.2;font-weight:bold;color:' + fg + ';text-decoration:none;border-radius:8px;') + '">' +
      escapeHtml(label) + ' &rarr;</a></td></tr></table>';
  }

  function outlineButton(url, label, color) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td' + fill(WHITE) + ' style="background-color:' + WHITE + ';border:2px solid ' + color + ';border-radius:8px;">' +
      '<a href="' + escapeHtml(url) + '" target="_blank" style="display:inline-block;padding:10px 22px;' + font(14, 'line-height:1.2;font-weight:bold;color:' + color + ';text-decoration:none;border-radius:8px;') + '">' +
      escapeHtml(label) + ' &rarr;</a></td></tr></table>';
  }

  function placeholder(message) {
    return section(layout(fill(GREY_BOX) + ' style="background-color:' + GREY_BOX + ';border-radius:8px;"',
      '<tr><td' + fill(GREY_BOX) + ' style="background-color:' + GREY_BOX + ';padding:18px;border-radius:8px;' + font(13, 'line-height:1.5;color:' + NOTE + ';') + '">' +
      escapeHtml(message) + '</td></tr>'), '16px 32px 8px 32px');
  }

  // Bar cells with widths in percent, rounded to one decimal, the last cell taking what is left so
  // they add up to 100. A cell under half a percent is merged into its neighbour. mark: a white
  // edge on the cell's left, where a stop begins.
  function barCells(segs, track) {
    var kept = [];
    var carry = 0;
    segs.forEach(function (g) {
      var w = g.width + carry;
      carry = 0;
      if (w < 0.5) {
        if (kept.length) kept[kept.length - 1].width += w;
        else carry = w;
        return;
      }
      kept.push({ width: w, color: g.color, mark: g.mark });
    });
    if (!kept.length) kept.push({ width: 100, color: track, mark: false });
    var used = 0;
    var cells = kept.map(function (g, i) {
      var w = i === kept.length - 1 ? Math.round((100 - used) * 10) / 10 : Math.round(g.width * 10) / 10;
      used += w;
      return '<td width="' + w + '%" height="10"' + fill(g.color) + ' style="width:' + w + '%;height:10px;line-height:10px;font-size:0;background-color:' + g.color + ';' +
        (g.mark ? 'border-left:2px solid ' + WHITE + ';' : '') + '">&nbsp;</td>';
    });
    return layout('', '<tr>' + cells.join('') + '</tr>');
  }

  // The route as a bar: filled to the position in the hall's colour, the rest in the track colour,
  // a white edge where each stop after the start begins. pos: from L.routePosition (laps wrap).
  function routeBar(pos, stops, color, track) {
    var finish = pos.finish;
    var inner = stops.map(function (s) { return s.units; }).filter(function (u) { return u > 0 && u < finish; });
    var cuts = [0, finish].concat(inner);
    if (pos.within > 0 && pos.within < finish) cuts.push(pos.within);
    cuts.sort(function (a, b) { return a - b; });
    cuts = cuts.filter(function (x, i) { return i === 0 || x !== cuts[i - 1]; });
    var segs = [];
    for (var i = 0; i < cuts.length - 1; i++) {
      segs.push({
        width: (cuts[i + 1] - cuts[i]) / finish * 100,
        color: cuts[i + 1] <= pos.within ? color : track,
        mark: inner.indexOf(cuts[i]) >= 0
      });
    }
    return barCells(segs, track);
  }

  function plainBar(percent, color, track) {
    var p = Math.max(0, Math.min(100, percent));
    return barCells([{ width: p, color: color, mark: false }, { width: 100 - p, color: track, mark: false }], track);
  }

  function headerBlock(s, ctx, c) {
    var logos = '<tr>' + LOGOS.map(function (l) {
      return '<td align="' + l.align + '" valign="middle">' +
        '<img src="' + IMG_BASE + l.file + '" width="' + l.width + '" height="' + l.height + '" alt="' + escapeHtml(l.alt) + '"' +
        ' style="display:inline-block;border:0;outline:none;text-decoration:none;width:' + l.width + 'px;height:' + l.height + 'px;' +
        font(12, 'line-height:1.2;color:' + c.onHeader + ';') + '"></td>';
    }).join('') + '</tr>';
    var title = renderInline(s.texts.title, ctx.values);
    var subtitle = renderInline(s.texts.subtitle, ctx.values);
    return '<tr><td' + fill(c.header) + ' style="background-color:' + c.header + ';padding:20px 32px 28px 32px;border-radius:12px 12px 0 0;">' +
      layout('', logos) +
      '<p style="margin:24px 0 8px 0;' + font(11, 'line-height:1.4;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:' + c.kicker + ';') + '">' + escapeHtml(ctx.programName) + '</p>' +
      (title ? '<h1 style="margin:0;' + font(26, 'line-height:1.25;font-weight:bold;color:' + c.onHeader + ';') + '">' + title + '</h1>' : '') +
      (subtitle ? '<p style="margin:10px 0 0 0;' + font(14, 'line-height:1.5;color:' + c.onHeader + ';') + '">' + subtitle + '</p>' : '') +
      '</td></tr>';
  }

  function introBlock(s, ctx) {
    var body = renderText(s.texts.intro, ctx.values, BODY);
    return body ? section(body, '28px 32px 4px 32px') : '';
  }

  function statsBlock(s, ctx, c) {
    if (!ctx.ready) return placeholder('The stat tiles appear here once the numbers load.');
    var cells = ctx.stats.map(function (t) {
      return '<td width="33%" valign="top" style="padding:6px;">' +
        layout(fill(c.page) + ' style="background-color:' + c.page + ';border-radius:10px;"',
          '<tr><td align="center"' + fill(c.page) + ' style="background-color:' + c.page + ';padding:16px 6px;border-radius:10px;">' +
          '<p style="margin:0;' + font(22, 'line-height:1.2;font-weight:bold;color:' + c.ink + ';') + '">' + escapeHtml(t.value) + '</p>' +
          '<p style="margin:4px 0 0 0;' + font(12, 'line-height:1.3;color:' + c.muted + ';') + '">' + escapeHtml(t.label) + '</p>' +
          '</td></tr>') + '</td>';
    }).join('');
    return section(layout('', '<tr>' + cells + '</tr>'), '12px 26px 4px 26px');
  }

  function raceBlock(s, ctx, c) {
    var hasRoute = ctx.stops.length >= 2;
    var title = hasRoute ? 'The hall race' : 'Hall standings';
    if (!ctx.ready) return placeholder(title + ' appears here once the numbers load.');
    var parts = [heading(escapeHtml(title), c)];
    if (hasRoute) {
      var first = ctx.stops[0];
      var last = ctx.stops[ctx.stops.length - 1];
      var middle = ctx.stops.slice(1, -1).map(function (m) { return escapeHtml(m.label) + ' (' + L.formatNumber(m.units) + ')'; });
      parts.push(note('The route runs from ' + escapeHtml(first.label) + ' to ' + escapeHtml(last.label) + ', ' +
        L.formatNumber(last.units) + ' ' + escapeHtml(L.unitWord(ctx.unit, last.units)) + '.' +
        (middle.length ? ' Stops on the way: ' + middle.join(', ') + '.' : '')));
    }
    ctx.sections.forEach(function (sec) {
      if (sec.label) parts.push(subheading(sec.label, c));
      if (!sec.halls.length) {
        parts.push(note('No ' + escapeHtml(L.unitWord(ctx.unit, 2)) + ' logged yet.'));
        return;
      }
      sec.halls.forEach(function (h) {
        var bar = h.position
          ? routeBar(h.position, ctx.stops, h.color, c.line)
          : plainBar(L.barPercent(h.points, sec.maxHallPoints), h.color, c.line);
        parts.push(layout(' style="margin:0 0 14px 0;"',
          '<tr><td style="padding:0 0 6px 0;' + font(14, 'font-weight:bold;color:' + c.ink + ';') + '">' + escapeHtml(String(h.rank)) + '&nbsp;&nbsp;' + badge(h.code, h.color, h.onColor) + '</td>' +
          '<td align="right" style="padding:0 0 6px 0;white-space:nowrap;' + font(14, 'font-weight:bold;color:' + c.ink + ';') + '">' + amount(h.points, ctx.unit, c) + '</td></tr>' +
          '<tr><td colspan="2" style="padding:0 0 6px 0;">' + bar + '</td></tr>' +
          (h.text ? '<tr><td colspan="2" style="' + font(13, 'line-height:1.4;color:' + SOFT + ';') + '">' + escapeHtml(h.text) + '</td></tr>' : '')));
      });
    });
    return section(parts.join(''), '24px 32px 4px 32px');
  }

  function topBlock(s, ctx, c) {
    var title = ctx.unit === 'steps' ? 'Top walkers' : 'Top scorers';
    if (!ctx.ready) return placeholder(title + ' appear here once the numbers load.');
    var parts = [heading(escapeHtml(title), c)];
    ctx.sections.forEach(function (sec) {
      if (sec.label) parts.push(subheading(sec.label, c));
      if (!sec.top.length) {
        parts.push(note('No entries yet.'));
        return;
      }
      parts.push(layout('', sec.top.map(function (r) {
        var who = s.showNames
          ? escapeHtml(r.name) + (r.hall ? '&nbsp;&nbsp;' + badge(r.hall, r.hallColor, r.hallOnColor) : '')
          : (r.hall ? 'A ' + escapeHtml(r.hall) + ' resident' : 'A resident');
        return '<tr>' +
          '<td width="28" valign="top" style="padding:6px 0;' + font(15, 'font-weight:bold;color:' + c.ink + ';') + '">' + escapeHtml(String(r.rank)) + '</td>' +
          '<td valign="top" style="padding:6px 0;' + font(14, 'line-height:1.4;color:' + TEXT + ';') + '">' + who + '</td>' +
          '<td align="right" valign="top" style="padding:6px 0;white-space:nowrap;' + font(14, 'font-weight:bold;color:' + c.ink + ';') + '">' + amount(r.points, ctx.unit, c) + '</td>' +
          '</tr>';
      }).join('')));
    });
    return section(parts.join(''), '24px 32px 4px 32px');
  }

  function reminderBlock(s, ctx, c) {
    var head = renderInline(s.texts.reminderHeading, ctx.values);
    var body = renderText(s.texts.reminder, ctx.values, BODY);
    var btn = ctx.form ? button(ctx.form.url, ctx.form.label, c.accent, c.onAccent, false) : '';
    if (!head && !body && !btn) return '';
    return section(layout(fill(c.page) + ' style="background-color:' + c.page + ';border-radius:8px;"',
      '<tr><td' + fill(c.page) + ' style="background-color:' + c.page + ';border-left:4px solid ' + c.header + ';border-radius:8px;padding:20px 22px 8px 22px;">' +
      (head ? '<p style="margin:0 0 10px 0;' + font(16, 'line-height:1.3;font-weight:bold;color:' + c.ink + ';') + '">' + head + '</p>' : '') +
      body + (btn ? '<div style="padding:0 0 14px 0;">' + btn + '</div>' : '') +
      '</td></tr>'), '20px 32px 8px 32px');
  }

  function prizesBlock(s, ctx, c) {
    var body = renderText(s.texts.prizes, ctx.values, BODY);
    if (!body) return '';
    var head = renderInline(s.texts.prizesHeading, ctx.values);
    return section((head ? heading(head, c) : '') + body, '20px 32px 4px 32px');
  }

  function hubBlock(s, ctx, c) {
    var url = httpsUrl(s.hubUrl);
    if (!url) return '';
    var body = renderText(s.texts.hubText, ctx.values, 'margin:0 0 16px 0;' + font(15, 'line-height:1.5;color:' + c.onHeader + ';'));
    return section(layout(fill(c.header) + ' style="background-color:' + c.header + ';border-radius:10px;"',
      '<tr><td align="center"' + fill(c.header) + ' style="background-color:' + c.header + ';padding:24px;border-radius:10px;">' +
      '<p style="margin:0 0 8px 0;' + font(11, 'line-height:1.4;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:' + c.kicker + ';') + '">Live standings</p>' +
      body + button(url, 'See live standings', c.accent, c.onAccent, true) +
      '</td></tr>'), '20px 32px 8px 32px');
  }

  function whatsappBlock(s, ctx, c) {
    if (!ctx.whatsappUrl) return '';
    return section(renderText(s.texts.whatsapp, ctx.values, BODY) + outlineButton(ctx.whatsappUrl, 'Join on WhatsApp', c.header), '16px 32px 8px 32px');
  }

  function signoffBlock(s, ctx) {
    var body = renderText(s.texts.signoff, ctx.values, 'margin:0 0 10px 0;' + font(14, 'line-height:1.6;color:' + SOFT + ';'));
    return body ? '<tr><td style="padding:24px 32px 22px 32px;">' + body + '</td></tr>' : '';
  }

  function footerBlock(s, ctx, c) {
    var body = renderInline(s.texts.footer, ctx.values);
    if (!body) return '';
    return '<tr><td align="center"' + fill(c.header) + ' style="background-color:' + c.header + ';padding:16px 32px;border-radius:0 0 12px 12px;' +
      font(11, 'line-height:1.5;letter-spacing:0.5px;color:' + c.onHeader + ';') + '">' + body + '</td></tr>';
  }

  function asOfRow(ctx) {
    if (!ctx.ready || !ctx.values.asOf) return '';
    return section('<p style="margin:0;' + font(12, 'line-height:1.4;color:' + NOTE + ';') + '">Standings as of ' + escapeHtml(ctx.values.asOf) + ', Dubai time.</p>', '0 32px 8px 32px');
  }

  var RENDER = {
    header: headerBlock, intro: introBlock, stats: statsBlock, race: raceBlock, top: topBlock, reminder: reminderBlock,
    prizes: prizesBlock, hub: hubBlock, whatsapp: whatsappBlock, signoff: signoffBlock, footer: footerBlock
  };

  // The blocks that are on, in order, each marked when it closes a run of live blocks.
  function shownBlocks(s) {
    var on = s.blocks.filter(function (b) { return b.on; });
    return on.map(function (b, i) {
      var next = on[i + 1];
      return { type: b.type, endsLiveRun: !!LIVE[b.type] && !(next && LIVE[next.type]) };
    });
  }

  function subjectLine(settings, ctx) {
    var s = mergeSettings(settings);
    return plainFill(s.subject, ctx.values).replace(/\s+/g, ' ');
  }

  // settings + context -> one complete HTML document: the exact text that is previewed and copied.
  function buildEmail(settings, ctx) {
    var s = mergeSettings(settings);
    var c = themeColors(s.theme, ctx.theme);
    var rows = [];
    shownBlocks(s).forEach(function (b) {
      var row = RENDER[b.type](s, ctx, c);
      if (row) rows.push(row);
      if (b.endsLiveRun) rows.push(asOfRow(ctx));
    });
    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + escapeHtml(subjectLine(s, ctx)) + '</title>',
      '</head>',
      '<body style="margin:0;padding:0;background-color:' + c.page + ';">',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"' + fill(c.page) + ' style="background-color:' + c.page + ';">',
      '<tr><td align="center"' + fill(c.page) + ' style="background-color:' + c.page + ';padding:24px 12px;">',
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"' + fill(WHITE) + ' style="width:100%;max-width:600px;background-color:' + WHITE + ';border-radius:12px;">',
      rows.filter(Boolean).join('\n'),
      '</table>',
      '</td></tr>',
      '</table>',
      '</body>',
      '</html>'
    ].join('\n');
  }

  var PLAIN = {
    header: function (s, ctx) {
      return [ctx.programName.toUpperCase(), plainFill(s.texts.title, ctx.values), plainFill(s.texts.subtitle, ctx.values)].filter(Boolean).join('\n');
    },
    intro: function (s, ctx) { return plainFill(s.texts.intro, ctx.values); },
    stats: function (s, ctx) { return ctx.stats.map(function (t) { return t.label + ': ' + t.value; }).join('\n'); },
    race: function (s, ctx) {
      if (!ctx.ready) return '';
      var lines = [ctx.stops.length >= 2 ? 'The hall race' : 'Hall standings'];
      ctx.sections.forEach(function (sec) {
        if (sec.label) lines.push('', sec.label);
        if (!sec.halls.length) lines.push('No ' + L.unitWord(ctx.unit, 2) + ' logged yet.');
        sec.halls.forEach(function (h) {
          lines.push(h.rank + '. ' + h.code + ': ' + L.formatNumber(h.points) + ' ' + L.unitWord(ctx.unit, h.points) + (h.text ? '. ' + h.text : ''));
        });
      });
      return lines.join('\n');
    },
    top: function (s, ctx) {
      if (!ctx.ready) return '';
      var lines = [ctx.unit === 'steps' ? 'Top walkers' : 'Top scorers'];
      ctx.sections.forEach(function (sec) {
        if (sec.label) lines.push('', sec.label);
        if (!sec.top.length) lines.push('No entries yet.');
        sec.top.forEach(function (r) {
          var who = s.showNames ? r.name + (r.hall ? ' (' + r.hall + ')' : '') : (r.hall ? 'A ' + r.hall + ' resident' : 'A resident');
          lines.push(r.rank + '. ' + who + ': ' + L.formatNumber(r.points) + ' ' + L.unitWord(ctx.unit, r.points));
        });
      });
      return lines.join('\n');
    },
    reminder: function (s, ctx) {
      return [plainFill(s.texts.reminderHeading, ctx.values), plainFill(s.texts.reminder, ctx.values),
        ctx.form ? ctx.form.label + ': ' + ctx.form.url : ''].filter(Boolean).join('\n');
    },
    prizes: function (s, ctx) {
      var body = plainFill(s.texts.prizes, ctx.values);
      return body ? [plainFill(s.texts.prizesHeading, ctx.values), body].filter(Boolean).join('\n') : '';
    },
    hub: function (s, ctx) {
      var url = httpsUrl(s.hubUrl);
      return url ? [plainFill(s.texts.hubText, ctx.values), 'See live standings: ' + url].filter(Boolean).join('\n') : '';
    },
    whatsapp: function (s, ctx) {
      return ctx.whatsappUrl ? [plainFill(s.texts.whatsapp, ctx.values), 'Join on WhatsApp: ' + ctx.whatsappUrl].filter(Boolean).join('\n') : '';
    },
    signoff: function (s, ctx) { return plainFill(s.texts.signoff, ctx.values); },
    footer: function (s, ctx) { return plainFill(s.texts.footer, ctx.values); }
  };

  // The same email as plain text, for apps that cannot take the formatted copy.
  function buildPlainText(settings, ctx) {
    var s = mergeSettings(settings);
    var parts = [];
    shownBlocks(s).forEach(function (b) {
      var part = PLAIN[b.type](s, ctx);
      if (part) parts.push(part);
      if (b.endsLiveRun && ctx.ready && ctx.values.asOf) parts.push('Standings as of ' + ctx.values.asOf + ', Dubai time.');
    });
    return parts.join('\n\n') + '\n';
  }

  Object.assign(api, {
    LOGOS: LOGOS,
    routeBar: routeBar,
    subjectLine: subjectLine,
    buildEmail: buildEmail,
    buildPlainText: buildPlainText
  });

  return api;
});
