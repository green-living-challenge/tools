/* GLC tools: the story maker's plan. Pure: the registry and a challenge payload in, the day's set of
   stories and every story's content out. No drawing, no DOM, no network, no storage. Loaded in the
   browser as window.GLCStory, after hub-logic.js, and in Node with require().
   Spec: docs/superpowers/specs/2026-10-12-story-maker-design.md */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../hub/hub-logic.js'));
  } else {
    root.GLCStory = factory(root.GLCLogic);
  }
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';

  var api = {};

  // ---------- section A: days, names, tokens, wordings ----------

  var DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var TOKEN_RE = /\{([A-Za-z]+)\}/g;
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var LONG_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var PROGRAM_NAME = 'Green Living Challenge';
  var HUB_LINK = 'https://green-living-challenge.github.io/leaderboard/?src=ig';
  var LOOKS = [
    { key: 'journal', label: 'Journal' },
    { key: 'scoreboard', label: 'Scoreboard' },
    { key: 'bigfact', label: 'Big fact' }
  ];
  var NAME_MODES = [
    { key: 'initial', label: 'First name and initial' },
    { key: 'full', label: 'Full names' },
    { key: 'none', label: 'No names' }
  ];
  var TYPES = [
    { key: 'cover', label: 'Cover' },
    { key: 'week', label: 'Week wrap' },
    { key: 'stretch', label: 'Final stretch' },
    { key: 'route', label: 'Route' },
    { key: 'standings', label: 'Hall standings' },
    { key: 'top', label: 'Top list' },
    { key: 'leaders', label: 'Leaders' },
    { key: 'spotlight', label: 'Hall spotlight' },
    { key: 'race', label: 'Closest race' },
    { key: 'poll', label: 'Poll' },
    { key: 'log', label: 'Call to log' },
    { key: 'finish', label: 'Finish line' },
    { key: 'thanks', label: 'Thank you' }
  ];
  var TYPE_KEYS = TYPES.map(function (t) { return t.key; });
  var FEATURES = ['route', 'standings', 'top', 'leaders', 'spotlight', 'race', 'poll'];
  var FINISH_SET = ['finish', 'standings', 'top', 'thanks'];
  var WORDINGS = {
    cover: ['{challenge}', 'Day {day} check-in', 'Still going strong'],
    week: ['Week {week}, done!', 'Week {week} in numbers', 'That was week {week}'],
    stretch: ['{daysLeft} left!', 'The final stretch', 'Almost there'],
    route: ['Where are the halls?', 'On the road', 'The trip so far'],
    standings: ['Hall standings', 'The hall race', 'How the halls stand'],
    top: ['{topLabel}', 'Leading the way', 'Out in front'],
    leaders: ['Leading the halls', 'Top of the table', "Who's ahead?"],
    spotlight: ['Hall spotlight', 'Spotlight on {hall}', 'Meet {hall}'],
    race: ['Closest race', 'Neck and neck', 'Too close to call'],
    poll: ['Your call', 'Place your bet', 'What do you think?'],
    log: ['Your turn', '{formLabel}', 'Every {unitOne} counts'],
    finish: ['The finish line', 'We made it', "That's a wrap"],
    thanks: ['Thank you, everyone', 'See you at the next one', 'What a challenge']
  };
  var HEADLINE_MAX = 80;

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function text(v) {
    return typeof v === 'string' ? v.trim() : '';
  }

  function num(v) {
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // 'YYYY-MM-DD' -> whole days since 1 January 1970, or NaN.
  function dayNumber(day) {
    var m = DAY_RE.exec(typeof day === 'string' ? day : '');
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : NaN;
  }

  function dayFromNumber(n) {
    var d = new Date(n * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  // '2026-10-06' -> 'Tue 6 Oct'. '' when unreadable.
  function shortDay(day) {
    var n = dayNumber(day);
    if (!isFinite(n)) return '';
    var d = new Date(n * 86400000);
    return WEEKDAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  }

  // '2026-10-05' -> 'Monday 5 October'. '' when unreadable.
  function longDay(day) {
    var n = dayNumber(day);
    if (!isFinite(n)) return '';
    var d = new Date(n * 86400000);
    return LONG_WEEKDAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTH_NAMES[d.getUTCMonth()];
  }

  // Two days -> '5 to 11 October', or '29 October to 4 November' across a month.
  function dayRange(a, b) {
    var x = dayNumber(a);
    var y = dayNumber(b);
    if (!isFinite(x) || !isFinite(y)) return '';
    var da = new Date(x * 86400000);
    var db = new Date(y * 86400000);
    if (da.getUTCMonth() === db.getUTCMonth()) return da.getUTCDate() + ' to ' + db.getUTCDate() + ' ' + MONTH_NAMES[db.getUTCMonth()];
    return da.getUTCDate() + ' ' + MONTH_NAMES[da.getUTCMonth()] + ' to ' + db.getUTCDate() + ' ' + MONTH_NAMES[db.getUTCMonth()];
  }

  var shortStamp = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
  });
  var longStamp = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true
  });

  // ISO time -> 'Mon 12 Oct, 9:00 AM' (long: 'Monday 12 October, 9:00 AM') in Dubai time. '' when unreadable.
  function asOfText(iso, long) {
    var ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (!isFinite(ms)) return '';
    var p = {};
    (long ? longStamp : shortStamp).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return p.weekday + ' ' + p.day + ' ' + p.month + ', ' + p.hour + ':' + p.minute + ' ' + String(p.dayPeriod).toUpperCase();
  }

  // Today's place in the challenge: { day, days, daysLeft }. day 1 is the start date; daysLeft
  // counts today and is 0 after the end. null without readable dates.
  function challengeDays(descriptor, today) {
    var d = isObject(descriptor) ? descriptor : {};
    var s = dayNumber(d.startDate);
    var e = dayNumber(d.endDate);
    var t = dayNumber(today);
    if (!isFinite(s) || !isFinite(e) || !isFinite(t) || e < s) return null;
    var day = t - s + 1;
    var days = e - s + 1;
    return { day: day, days: days, daysLeft: Math.max(0, Math.min(days, days - day + 1)) };
  }

  // 'before' (not started), 'live', or 'finish' (after the end date, or closed in the engine).
  function storyState(descriptor, today, isFinal) {
    var s = L.deriveState(descriptor, today, isFinal);
    if (s === 'upcoming') return 'before';
    return s === 'live' ? 'live' : 'finish';
  }

  // Journal, Scoreboard, Big fact in turn from day 1.
  function lookOfDay(day) {
    var d = Math.max(1, Math.floor(num(day)) || 1);
    return LOOKS[(d - 1) % LOOKS.length].key;
  }

  // A public name as the names setting asks: 'initial' (default) 'Vera E.', 'full' as given,
  // 'none' 'a GHw resident'. A one-word name stays as it is.
  function shownName(name, mode, hall) {
    if (mode === 'none') return text(hall) ? 'a ' + text(hall) + ' resident' : 'a resident';
    var n = text(name) || 'Resident';
    if (mode === 'full') return n;
    var parts = n.split(/\s+/);
    if (parts.length < 2) return n;
    return parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.';
  }

  // '{name}' -> values.name when that is a string or a finite number, else left as typed.
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

  function ordinal(n) {
    var v = Math.floor(num(n));
    var tens = v % 100;
    var end = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] || 'th';
    return v + end;
  }

  function lowerFirst(s) {
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }

  function plural(n, one, many) {
    return L.formatNumber(n) + ' ' + (num(n) === 1 ? one : many);
  }

  Object.assign(api, {
    HUB_LINK: HUB_LINK,
    LOOKS: LOOKS,
    NAME_MODES: NAME_MODES,
    TYPES: TYPES,
    FEATURES: FEATURES,
    WORDINGS: WORDINGS,
    dayNumber: dayNumber,
    shortDay: shortDay,
    longDay: longDay,
    dayRange: dayRange,
    asOfText: asOfText,
    challengeDays: challengeDays,
    storyState: storyState,
    lookOfDay: lookOfDay,
    shownName: shownName,
    fillTokens: fillTokens,
    ordinal: ordinal
  });

  // ---------- section B: the facts every story is made from ----------

  function registryOrder(registryHalls) {
    var order = {};
    (Array.isArray(registryHalls) ? registryHalls : []).forEach(function (h, i) {
      if (isObject(h) && text(h.code) && !(text(h.code) in order)) order[text(h.code)] = i;
    });
    return order;
  }

  function orderOf(order, code) {
    return code in order ? order[code] : 1e6;
  }

  // Halls by total, highest first, ties in registry order, with competition ranks (1, 2, 2, 4).
  function rankHalls(halls, order) {
    var list = halls.slice().sort(function (a, b) {
      return b.points - a.points || orderOf(order, a.code) - orderOf(order, b.code);
    });
    var out = [];
    list.forEach(function (h, i) {
      var rank = i > 0 && h.points === list[i - 1].points ? out[i - 1].rank : i + 1;
      out.push(Object.assign({}, h, { rank: rank }));
    });
    return out;
  }

  // The two neighbouring halls of one division with the smallest gap, among halls with a total
  // above 0. The higher pair wins a tie. null below two such halls.
  function closestRace(section) {
    var list = section.halls.filter(function (h) { return h.points > 0; });
    var best = null;
    for (var i = 0; i + 1 < list.length; i++) {
      var gap = list[i].points - list[i + 1].points;
      if (!best || gap < best.gap) best = { key: section.key, label: section.label, a: list[i], b: list[i + 1], gap: gap };
    }
    return best;
  }

  // The halls with a participant, one division after the other in turn, each in registry order.
  function spotlightHalls(sections, order) {
    var lists = sections.map(function (s) {
      return s.halls.filter(function (h) { return h.participants > 0; }).sort(function (a, b) {
        return orderOf(order, a.code) - orderOf(order, b.code);
      });
    });
    var out = [];
    var longest = lists.reduce(function (m, l) { return Math.max(m, l.length); }, 0);
    for (var i = 0; i < longest; i++) {
      lists.forEach(function (l) { if (l[i]) out.push(l[i]); });
    }
    return out;
  }

  // Residents logged per day, from each participant's public day record ('1' per day logged,
  // from the start date). Only these counts are ever kept.
  function dayCounts(students) {
    var counts = [];
    (Array.isArray(students) ? students : []).forEach(function (s) {
      var days = isObject(s) && typeof s.days === 'string' ? s.days : '';
      for (var i = 0; i < days.length; i++) {
        if (days.charAt(i) === '1') counts[i] = (counts[i] || 0) + 1;
      }
    });
    for (var j = 0; j < counts.length; j++) counts[j] = counts[j] || 0;
    return counts;
  }

  function daysBackOf(descriptor) {
    var tasks = isObject(descriptor) && Array.isArray(descriptor.tasks) ? descriptor.tasks : [];
    return tasks.reduce(function (m, t) {
      return isObject(t) && t.retired !== true ? Math.max(m, num(t.daysBack)) : m;
    }, 0);
  }

  // Registry + challenge payload -> everything the stories need, or null when the registry does
  // not list the challenge. payload may be null (not loaded yet) or another challenge's: ready is
  // then false and the numbers are empty.
  function buildFacts(registry, payload, challengeId, nowMs) {
    var d = L.findChallenge(registry, challengeId);
    if (!d) return null;
    var reg = isObject(registry) ? registry : {};
    var program = isObject(reg.program) ? reg.program : {};
    var regHalls = Array.isArray(reg.halls) ? reg.halls : [];
    var p = isObject(payload) && payload.id === d.id && isObject(payload.totals) ? payload : null;
    var today = L.todayInDubai(nowMs);
    var groups = d.divisions === true ? L.divisionsFor(regHalls) : [];
    // Up to two divisions are drawn; more groups are drawn as one list.
    if (groups.length > 2) groups = [];
    var shape = groups.length ? d : Object.assign({}, d, { divisions: false });
    var unit = L.unitLabel(d);
    var order = registryOrder(regHalls);
    var stops = L.routeMilestones(d);
    var sections = (groups.length ? groups : [{ key: '', label: '' }]).map(function (g) {
      var v = L.challengeView(shape, p, reg, nowMs, g.key, text(program.name) || PROGRAM_NAME);
      var halls = v.halls.map(function (h) {
        return Object.assign({}, h, { position: stops.length ? L.routePosition(h.points, stops) : null });
      });
      // Only what a story may show is kept: no pid (rankRows keeps it as the row key).
      var rows = v.rows.map(function (r) {
        return { rank: r.rank, name: r.name, hall: r.hall, points: r.points, hallColor: r.hallColor };
      });
      return { key: g.key, label: g.label, halls: rankHalls(halls, order), rows: rows };
    });
    var form = isObject(d.form) ? d.form : {};
    return {
      ready: !!p,
      id: d.id,
      name: text(d.name) || 'Challenge',
      icon: text(d.icon),
      tagline: text(d.tagline),
      prizes: text(d.prizes),
      ranked: d.leaderboard === 'ranked',
      theme: d.theme,
      unit: unit,
      unitOne: L.unitWord(unit, 1),
      topLabel: unit === 'steps' ? 'Top walkers' : 'Top scorers',
      formLabel: text(form.label) || "Log today's " + unit,
      daysBack: daysBackOf(d),
      startDate: d.startDate,
      endDate: d.endDate,
      today: today,
      count: challengeDays(d, today),
      state: storyState(d, today, !!(p && p.final === true)),
      final: d.closed === true || !!(p && p.final === true),
      asOf: p ? asOfText(p.updatedAt) : '',
      asOfLong: p ? asOfText(p.updatedAt, true) : '',
      totals: p ? { participants: num(p.totals.participants), points: num(p.totals.points) } : null,
      stops: stops,
      split: groups.length === 2,
      sections: sections,
      spotHalls: spotlightHalls(sections, order),
      races: sections.map(closestRace).filter(Boolean).sort(function (a, b) { return a.gap - b.gap; }),
      dayCounts: p ? dayCounts(p.students) : []
    };
  }

  function allHalls(f) {
    return f.sections.reduce(function (all, s) { return all.concat(s.halls); }, []);
  }

  // Which story types have data today: { type: true|false }.
  function available(f) {
    var halls = allHalls(f);
    var c = f.count || { day: 0, daysLeft: 0 };
    var data = f.ready;
    var live = f.state === 'live';
    return {
      cover: live,
      week: live && c.day >= 7,
      stretch: live && c.daysLeft >= 1 && c.daysLeft <= 3,
      route: f.stops.length > 0,
      standings: data && halls.length > 0,
      top: data && f.sections.some(function (s) { return s.rows.length > 0; }),
      leaders: data && halls.some(function (h) { return h.points > 0; }),
      spotlight: data && f.spotHalls.length > 0,
      race: data && f.races.length > 0,
      poll: data && f.races.length > 0,
      log: f.state === 'live',
      finish: f.state === 'finish',
      thanks: f.state === 'finish'
    };
  }

  Object.assign(api, {
    buildFacts: buildFacts,
    available: available
  });

  // ---------- section C: the day's set and today's changes ----------

  var CARDS = ['day', 'standings'];

  function emptyDayState() {
    return { look: '', shuffle: 0, slots: [] };
  }

  // A saved day of any shape -> { look, shuffle, slots: [{ type, on, headline }], card? }. card,
  // the WhatsApp picture chosen for the day, is there only when it is 'day' or 'standings'.
  function mergeDayState(saved) {
    var s = emptyDayState();
    if (!isObject(saved)) return s;
    if (LOOKS.some(function (l) { return l.key === saved.look; })) s.look = saved.look;
    if (CARDS.indexOf(saved.card) >= 0) s.card = saved.card;
    var k = Math.floor(num(saved.shuffle));
    s.shuffle = k > 0 && k < 1000 ? k : 0;
    (Array.isArray(saved.slots) ? saved.slots.slice(0, 6) : []).forEach(function (o, i) {
      var x = isObject(o) ? o : {};
      s.slots[i] = {
        type: TYPE_KEYS.indexOf(x.type) >= 0 ? x.type : '',
        on: x.on !== false,
        headline: typeof x.headline === 'string' ? x.headline.slice(0, HEADLINE_MAX) : ''
      };
    });
    for (var i = 0; i < s.slots.length; i++) if (!s.slots[i]) s.slots[i] = { type: '', on: true, headline: '' };
    return s;
  }

  // One slot changed: patch holds any of type, on, headline.
  function setSlot(saved, index, patch) {
    var s = mergeDayState(saved);
    for (var i = s.slots.length; i <= index; i++) s.slots[i] = { type: '', on: true, headline: '' };
    s.slots[index] = Object.assign({}, s.slots[index], patch);
    return mergeDayState(s);
  }

  function setLook(saved, look) {
    var s = mergeDayState(saved);
    s.look = look;
    return mergeDayState(s);
  }

  // The WhatsApp picture for the day: 'day' or 'standings'; anything else goes back to today's pick.
  function setCard(saved, card) {
    var s = mergeDayState(saved);
    if (CARDS.indexOf(card) >= 0) s.card = card;
    else delete s.card;
    return s;
  }

  // Shuffle: the next pick of features and wordings. Swaps and headlines are cleared, because
  // they belonged to the stories that are no longer there.
  function shuffleDay(saved) {
    var s = mergeDayState(saved);
    return { look: s.look, shuffle: s.shuffle + 1, slots: [] };
  }

  function openerFor(count) {
    if (count.daysLeft >= 1 && count.daysLeft <= 3) return 'stretch';
    if (count.day % 7 === 0) return 'week';
    return 'cover';
  }

  // The day's set: { state, look, autoLook, day, stories: [{ slot, type, auto, on, headline,
  // occurrence, wording, options }] }. No stories before the start or without readable dates.
  function planDay(f, saved) {
    var s = mergeDayState(saved);
    var c = f.count;
    var autoLook = lookOfDay(c ? c.day : 1);
    var plan = { state: f.state, look: s.look || autoLook, autoLook: autoLook, day: c ? c.day : 0, shuffle: s.shuffle, stories: [] };
    if (!c || f.state === 'before') return plan;
    var avail = available(f);
    var pool = FEATURES.filter(function (t) { return avail[t]; });
    var n = pool.length;
    var base = 2 * (c.day - 1) + 2 * s.shuffle;
    var types;
    var positions;
    if (f.state === 'finish') {
      types = FINISH_SET.filter(function (t) { return avail[t]; });
      positions = types.map(function () { return base; });
    } else {
      var feats = n === 0 ? [] : n === 1 ? [pool[0]] : [pool[base % n], pool[(base + 1) % n]];
      types = [openerFor(c)].concat(feats, ['log']);
      positions = types.map(function (t, i) { return i >= 1 && i <= feats.length ? base + i - 1 : base; });
    }
    var options = TYPE_KEYS.filter(function (t) { return avail[t]; });
    plan.stories = types.map(function (type, i) {
      var o = s.slots[i] || { type: '', on: true, headline: '' };
      var chosen = o.type && avail[o.type] ? o.type : type;
      var position = chosen === type ? positions[i] : base;
      return {
        slot: i,
        type: chosen,
        auto: type,
        on: o.on !== false,
        headline: o.headline,
        occurrence: n ? Math.floor(position / n) : 0,
        wording: (c.day - 1 + s.shuffle) % 3,
        options: options
      };
    });
    return plan;
  }

  Object.assign(api, {
    emptyDayState: emptyDayState,
    mergeDayState: mergeDayState,
    setSlot: setSlot,
    setLook: setLook,
    setCard: setCard,
    shuffleDay: shuffleDay,
    planDay: planDay
  });

  // ---------- section D: colours and each story's content ----------

  var WHITE = '#FFFFFF';
  var BLACK = '#000000';

  // The end to move a colour towards so it reads on bg: white on a dark bg, black on a light one.
  function pole(bg) {
    return L.readableTextOn(bg) === WHITE ? WHITE : BLACK;
  }

  // color moved towards toward until it reaches ratio against bg (toward itself at worst).
  function reach(color, toward, bg, ratio) {
    for (var i = 0; i <= 20; i++) {
      var c = L.mixHex(color, toward, i / 20);
      if (L.contrastRatio(c, bg) >= ratio) return c;
    }
    return toward;
  }

  // The colours of one look for a challenge theme.
  function palette(look, theme) {
    var v = L.themeVars(theme);
    var header = v['--glc-from'];
    var accent = v['--glc-accent'];
    var page = v['--glc-page'];
    var ink = v['--glc-ink'];
    if (look === 'scoreboard') {
      var bg = L.mixHex(header, BLACK, 0.75);
      var fg = L.contrastRatio(page, bg) >= 4.5 ? page : WHITE;
      return { look: look, bg: bg, fg: fg, accent: reach(accent, WHITE, bg, 3), muted: reach(L.mixHex(fg, bg, 0.3), fg, bg, 4.5), track: L.mixHex(bg, WHITE, 0.1), header: header, page: page };
    }
    if (look === 'bigfact') {
      return { look: look, bg: header, fg: L.readableTextOn(header), accent: accent, header: header, page: page, ink: ink };
    }
    var text = L.contrastRatio(ink, page) >= 4.5 ? ink : L.readableTextOn(page);
    var darkPage = pole(page) === WHITE;
    return {
      look: 'journal',
      bg: page,
      fg: text,
      head: reach(header, pole(page), page, 3),
      stamp: reach(accent, pole(page), page, 3),
      dots: L.mixHex(page, header, 0.16),
      // White cards on a light page; on a dark page, cards a shade lighter than it.
      card: darkPage ? L.mixHex(page, WHITE, 0.1) : WHITE,
      stub: accent,
      onStub: L.readableTextOn(accent),
      muted: reach(L.mixHex(text, page, 0.3), text, page, 4.5),
      header: header,
      page: page
    };
  }

  // A hall's colour as a look draws it: lightened on the dark Scoreboard until it reaches 3:1.
  function hallTone(pal, color) {
    return pal.look === 'scoreboard' ? reach(color, WHITE, pal.bg, 3) : color;
  }

  // The colours a story is drawn on: { bg, fg, big }. Journal and Scoreboard keep their palette;
  // Big fact gives each story its own colour (spec section 4).
  function surface(pal, type, hallColor) {
    if (pal.look !== 'bigfact') return { bg: pal.bg, fg: pal.fg, big: pal.look === 'journal' ? pal.head : pal.fg };
    var bg = pal.header;
    if (type === 'cover' || type === 'week' || type === 'finish') bg = pal.accent;
    else if (type === 'stretch' || type === 'log') bg = pal.page;
    else if (type === 'spotlight' && hallColor) bg = hallColor;
    var fg = L.readableTextOn(bg);
    return { bg: bg, fg: fg, big: bg === pal.page ? reach(pal.accent, pole(bg), bg, 3) : fg };
  }

  // Where a hall is on the route, as words: 'past Dubai Mall', 'on lap 2, past Rain Room'.
  function whereText(pos) {
    var lap = pos.laps >= 1 ? 'on lap ' + (pos.laps + 1) + ', ' : '';
    if (!pos.laps && pos.within === 0) return 'at the start';
    if (pos.within === pos.passed.units) return lap + 'at ' + pos.passed.label;
    if (pos.passed.units === 0 && pos.next) return lap + 'on the way to ' + pos.next.label;
    return lap + 'past ' + pos.passed.label;
  }

  function amount(f, n) {
    return L.formatNumber(n) + ' ' + L.unitWord(f.unit, n);
  }

  // 'GHw is past Sheikh Zayed Grand Mosque' with a route, else 'GHw leads with 228,840 steps'.
  function leaderLine(f, h) {
    return h.position ? h.code + ' is ' + whereText(h.position) : h.code + ' leads with ' + amount(f, h.points);
  }

  function toGoLine(f, h) {
    var pos = h.position;
    return pos && pos.next ? amount(f, pos.toGo) + ' to ' + pos.next.label : '';
  }

  function hallBrief(f, pal, h) {
    var color = hallTone(pal, h.color);
    return { code: h.code, color: color, onColor: L.readableTextOn(color), value: L.formatNumber(h.points) };
  }

  function weekRows(f, week) {
    var start = dayNumber(f.startDate);
    var end = Math.min(start + 7 * week - 1, dayNumber(f.endDate));
    var first = start + 7 * (week - 1);
    var logged = 0;
    var best = -1;
    var bestCount = 0;
    for (var n = first; n <= end; n++) {
      var c = f.dayCounts[n - start] || 0;
      logged += c;
      if (c > bestCount) {
        best = n;
        bestCount = c;
      }
    }
    var rows = [
      { label: f.unit.charAt(0).toUpperCase() + f.unit.slice(1) + ' so far', value: L.formatNumber(f.totals.points) },
      { label: 'Residents taking part', value: L.formatNumber(f.totals.participants) },
      { label: 'Days logged this week', value: L.formatNumber(logged) },
      { label: 'Busiest day', value: best >= 0 ? shortDay(dayFromNumber(best)) : 'None yet' }
    ];
    var halls = allHalls(f).filter(function (h) { return h.participants > 0; });
    if (f.stops.length > 1 && halls.length) {
      var stops = f.stops.slice(1);
      var pick = null;
      for (var i = stops.length - 1; i >= 0 && !pick; i--) {
        var k = halls.filter(function (h) { return h.points >= stops[i].units; }).length;
        if (2 * k >= halls.length) pick = { stop: stops[i], k: k };
      }
      if (!pick) pick = { stop: stops[0], k: halls.filter(function (h) { return h.points >= stops[0].units; }).length };
      rows.push({ label: 'Halls past ' + pick.stop.label, value: pick.k + ' of ' + halls.length });
    } else {
      var leaders = f.sections.map(function (s) { return s.halls[0]; }).filter(Boolean).map(function (h) { return h.code; });
      rows.push({ label: leaders.length > 1 ? 'Leading halls' : 'Leading hall', value: leaders.join(' and ') || 'None yet' });
    }
    return { range: dayRange(dayFromNumber(first), dayFromNumber(end)), rows: rows };
  }

  function sectionIndex(f, key) {
    for (var i = 0; i < f.sections.length; i++) if (f.sections[i].key === key) return i;
    return -1;
  }

  function groupWord(section) {
    return lowerFirst(section.label);
  }

  // Everything one story shows, or null when its data is missing. story: an entry of
  // planDay().stories; opts: { look, names }.
  function storyContent(f, story, opts) {
    var o = isObject(opts) ? opts : {};
    var look = LOOKS.some(function (l) { return l.key === o.look; }) ? o.look : 'journal';
    var names = NAME_MODES.some(function (m) { return m.key === o.names; }) ? o.names : 'initial';
    var type = story.type;
    var pal = palette(look, f.theme);
    var c = f.count || { day: 1, days: 1, daysLeft: 0 };
    var halls = allHalls(f);
    var spot = type === 'spotlight' && f.spotHalls.length ? f.spotHalls[story.occurrence % f.spotHalls.length] : null;
    var race = null;
    if (type === 'race') race = f.races[0] || null;
    if (type === 'poll' && f.races.length) {
      var byDivision = f.races.slice().sort(function (a, b) { return sectionIndex(f, a.key) - sectionIndex(f, b.key); });
      race = byDivision[story.occurrence % byDivision.length];
    }
    var week = Math.max(1, Math.floor(c.day / 7));
    var tokens = {
      challenge: f.name,
      day: c.day,
      days: c.days,
      week: week,
      daysLeft: L.daysText(c.daysLeft),
      topLabel: f.topLabel,
      formLabel: f.formLabel,
      unit: f.unit,
      unitOne: f.unitOne
    };
    if (spot) tokens.hall = spot.code;
    var wordings = WORDINGS[type] || [''];
    var base = {
      type: type,
      look: look,
      pal: pal,
      surface: surface(pal, type, spot ? spot.color : null),
      headline: fillTokens(story.headline || wordings[story.wording % wordings.length], tokens),
      kicker: PROGRAM_NAME,
      asOf: f.asOf ? 'As of ' + f.asOf : '',
      unit: f.unit
    };
    var x = {};
    if (type === 'cover') {
      if (!f.totals) return null;
      x = {
        badge: ['Day ' + c.day, 'of ' + c.days],
        total: L.formatNumber(f.totals.points),
        totalLine: f.unit + ' so far, by ' + plural(f.totals.participants, 'resident', 'residents'),
        tagline: f.tagline
      };
    } else if (type === 'week') {
      if (!f.totals || c.day < 7 || week > Math.ceil(c.days / 7)) return null;
      var w = weekRows(f, week);
      x = { badge: ['Week ' + week, 'of ' + Math.ceil(c.days / 7)], range: w.range, rows: w.rows };
    } else if (type === 'stretch') {
      x = {
        big: L.formatNumber(c.daysLeft),
        bigLabel: c.daysLeft === 1 ? 'day left' : 'days left',
        lines: f.sections.filter(function (s) { return s.halls.length; }).map(function (s) {
          return s.halls[0].code + (f.split ? ' leads the ' + groupWord(s) : ' leads');
        }),
        closing: 'Every ' + f.unitOne + ' counts now.'
      };
    } else if (type === 'route') {
      if (!f.stops.length) return null;
      var finish = f.stops[f.stops.length - 1].units;
      x = {
        stops: f.stops.map(function (s) { return { label: s.label, at: s.units / finish }; }),
        lanes: f.sections.map(function (s) {
          return {
            label: s.label,
            halls: s.halls.map(function (h) {
              var b = hallBrief(f, pal, h);
              return Object.assign(b, { at: h.position ? h.position.within / finish : 0, lap: h.position && h.position.laps ? h.position.laps + 1 : 0 });
            })
          };
        }),
        lines: f.sections.filter(function (s) { return s.halls.length; }).map(function (s) { return leaderLine(f, s.halls[0]) + '.'; })
      };
    } else if (type === 'standings') {
      if (!halls.length) return null;
      var limit = f.split ? 6 : 10;
      x = {
        groups: f.sections.filter(function (s) { return s.halls.length; }).map(function (s) {
          var max = s.halls.reduce(function (m, h) { return Math.max(m, h.points); }, 0);
          var finishUnits = f.stops.length ? f.stops[f.stops.length - 1].units : 0;
          var more = s.halls.length - limit;
          return {
            label: s.label,
            rows: s.halls.slice(0, limit).map(function (h) {
              var b = hallBrief(f, pal, h);
              var pos = h.position;
              return Object.assign(b, {
                rank: h.rank,
                fraction: pos ? pos.within / finishUnits : max > 0 ? h.points / max : 0,
                lap: pos && pos.laps ? 'Lap ' + (pos.laps + 1) : ''
              });
            }),
            more: more > 0 ? 'and ' + plural(more, 'more hall', 'more halls') : ''
          };
        }),
        barNote: f.stops.length ? 'Bars: the way to ' + f.stops[f.stops.length - 1].label : ''
      };
    } else if (type === 'top') {
      var size = f.split ? 3 : 5;
      var groups = f.sections.filter(function (s) { return s.rows.length; }).map(function (s) {
        return {
          label: s.label,
          rows: s.rows.slice(0, size).map(function (r) {
            var color = hallTone(pal, r.hallColor);
            return { rank: r.rank, name: shownName(r.name, names, r.hall), hall: r.hall, color: color, onColor: L.readableTextOn(color), value: L.formatNumber(r.points) };
          })
        };
      });
      if (!groups.length) return null;
      x = { groups: groups, prizes: f.prizes };
    } else if (type === 'leaders') {
      var leads = f.sections.filter(function (s) { return s.halls.length && s.halls[0].points > 0; }).map(function (s) {
        var h = s.halls[0];
        var b = hallBrief(f, pal, h);
        return Object.assign(b, {
          label: f.split ? 'Leading the ' + groupWord(s) : 'In the lead',
          line: h.position ? 'is ' + whereText(h.position) : 'leads with ' + amount(f, h.points),
          sub: toGoLine(f, h)
        });
      });
      if (!leads.length) return null;
      x = { groups: leads };
    } else if (type === 'spotlight') {
      if (!spot) return null;
      var section = f.sections.filter(function (s) { return s.halls.some(function (h) { return h.code === spot.code; }); })[0];
      var joint = section.halls.filter(function (h) { return h.rank === spot.rank; }).length > 1;
      var placeShort = (joint ? 'joint ' : '') + ordinal(spot.rank);
      var pos = spot.position;
      x = Object.assign(hallBrief(f, pal, spot), {
        place: placeShort + ' of ' + section.halls.length + (f.split ? ' in the ' + groupWord(section) : ' halls'),
        placeShort: placeShort,
        residents: plural(spot.participants, 'resident', 'residents'),
        stops: pos ? f.stops.map(function (s) { return { label: s.label, at: s.units / pos.finish }; }) : [],
        at: pos ? pos.within / pos.finish : null,
        next: pos && pos.next ? 'Next stop: ' + pos.next.label + ', ' + amount(f, pos.toGo) + ' away.' : ''
      });
    } else if (type === 'race') {
      if (!race) return null;
      var other = f.races.filter(function (r) { return r !== race; })[0];
      x = {
        label: race.label,
        a: hallBrief(f, pal, race.a),
        b: hallBrief(f, pal, race.b),
        gap: L.formatNumber(race.gap),
        gapLabel: L.unitWord(f.unit, race.gap) + ' apart',
        other: other ? other.label + ': ' + other.a.code + ' leads ' + other.b.code + ' by ' + L.formatNumber(other.gap) + '.' : ''
      };
    } else if (type === 'poll') {
      if (!race) return null;
      var pa = race.a.position;
      var pb = race.b.position;
      var shared = pa && pb && pa.next && pb.next && pa.next.label === pb.next.label;
      x = {
        label: race.label,
        a: hallBrief(f, pal, race.a),
        b: hallBrief(f, pal, race.b),
        question: shared ? 'Who passes ' + pa.next.label + ' first?' : 'Who will be ahead next week?',
        options: [race.a.code, race.b.code],
        hint: pa && pb && pa.next && pb.next
          ? race.a.code + ' needs ' + L.formatNumber(pa.toGo) + ' more ' + L.unitWord(f.unit, pa.toGo) + '. ' + race.b.code + ' needs ' + L.formatNumber(pb.toGo) + '.'
          : race.a.code + ' leads by ' + amount(f, race.gap) + '.'
      };
    } else if (type === 'log') {
      var steps = f.unit === 'steps'
        ? ['Check your step count', 'Take a screenshot', f.daysBack >= 1 ? 'Log it for today or yesterday' : 'Log it today']
        : ["Do today's task", 'Keep your proof', 'Log it on the form'];
      x = {
        formLabel: f.formLabel,
        steps: steps,
        badge: [L.formatNumber(c.daysLeft), c.daysLeft === 1 ? 'day left' : 'days left'],
        sticker: 'Tap the link: the standings and the log button'
      };
      base.asOf = '';
    } else if (type === 'finish') {
      if (!f.totals) return null;
      x = {
        total: L.formatNumber(f.totals.points),
        totalLine: f.unit + ' in ' + plural(c.days, 'day', 'days'),
        line: plural(f.totals.participants, 'resident', 'residents') + ' took part'
      };
    } else if (type === 'thanks') {
      x = {
        line: f.final ? 'Final results are on the leaderboard.' : 'Winners are confirmed by the EcoReps.',
        sticker: 'Tap the link: the full leaderboard'
      };
      base.asOf = '';
    } else {
      return null;
    }
    return Object.assign(base, x);
  }

  // The story's own wording for the day, filled, whatever is typed in its headline field.
  function defaultHeadline(f, story) {
    var c = storyContent(f, Object.assign({}, story, { headline: '' }), { look: 'journal' });
    return c ? c.headline : '';
  }

  // The poll sticker's text for the page's helper: { question, options } or null.
  function pollHelper(content) {
    return content && content.type === 'poll' ? { question: content.question, options: content.options.slice() } : null;
  }

  // 'take-a-step-trip-f26-2026-10-12-1-cover.png'
  function fileName(id, today, position, type) {
    return id + '-' + today + '-' + position + '-' + type + '.png';
  }

  // A hall as a chip in a look: { code, color, onColor, value }, the colour toned as the stories tone it.
  function hallChip(f, look, h) {
    return hallBrief(f, palette(look, f.theme), h);
  }

  Object.assign(api, {
    palette: palette,
    surface: surface,
    whereText: whereText,
    hallChip: hallChip,
    storyContent: storyContent,
    defaultHeadline: defaultHeadline,
    pollHelper: pollHelper,
    fileName: fileName
  });

  return api;
});
