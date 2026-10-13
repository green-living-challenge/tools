/* GLC tools: the WhatsApp messages' plan. Pure: the story maker's facts and today's plan in, the
   day's messages, the picture of the day and the cards' content out. No drawing, no DOM, no
   network, no storage. Loaded in the browser as window.GLCWhatsApp, after story-plan.js, and in
   Node with require(). Spec: docs/superpowers/specs/2026-10-13-whatsapp-messages-design.md */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../hub/hub-logic.js'), require('./story-plan.js'));
  } else {
    root.GLCWhatsApp = factory(root.GLCLogic, root.GLCStory);
  }
})(typeof self !== 'undefined' ? self : this, function (L, S) {
  'use strict';

  var api = {};

  // ---------- section A: words, emoji, links ----------

  var HUB_LINK = 'https://green-living-challenge.github.io/leaderboard/?src=wa';
  var SITE = 'green-living-challenge.github.io/leaderboard';
  var EMOJI = {
    footprints: '👣',
    recycle: '♻️',
    zap: '⚡',
    droplet: '💧',
    droplets: '💧',
    bike: '🚲',
    sun: '☀️',
    lightbulb: '💡',
    utensils: '🍽️',
    'utensils-crossed': '🍽️',
    trees: '🌳',
    'tree-pine': '🌳',
    wind: '🌬️'
  };
  var PLANT = '🌱';
  var WORDINGS = {
    title: ['{challenge}, day {day} of {days}', 'Day {day} of {days}: {challenge}', '{challenge}: day {day} check-in'],
    week: ['Week {week}, done!', 'Week {week} in numbers', 'That was week {week}'],
    stretch: ['{daysLeft} left!', 'The final stretch', 'Almost there'],
    finish: ['The finish line', 'We made it', "That's a wrap"],
    log: ['{formLabel}:', 'Every {unitOne} counts. Log yours:', 'Your turn. The standings and the log button:'],
    closing: ['The standings and the log button:', 'See every hall and log yours:', 'Full standings and the log button:'],
    reminder: ["Have you logged today's {unit}?", "Don't forget today's {unit}", 'A quick reminder']
  };
  var OPENER = { daily: 'cover', week: 'week', stretch: 'stretch', finish: 'finish' };

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function lowerFirst(s) {
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }

  function bold(s) {
    return '*' + s + '*';
  }

  function italic(s) {
    return '_' + s + '_';
  }

  function plain(s) {
    return s;
  }

  // ['a'] -> 'a'; ['a', 'b'] -> 'a and b'; ['a', 'b', 'c'] -> 'a, b and c'.
  function andList(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function amount(f, n) {
    return L.formatNumber(n) + ' ' + L.unitWord(f.unit, n);
  }

  function residents(n) {
    return L.formatNumber(n) + (n === 1 ? ' resident' : ' residents');
  }

  // Blocks of lines -> one message: lines joined by a line break, blocks by a blank line. Empty
  // lines and empty blocks are left out.
  function blocks(list) {
    return list.map(function (b) {
      return b.filter(Boolean).join('\n');
    }).filter(Boolean).join('\n\n');
  }

  // The challenge's emoji, from its icon name. A seedling for any other icon.
  function emojiFor(icon) {
    return Object.prototype.hasOwnProperty.call(EMOJI, icon) ? EMOJI[icon] : PLANT;
  }

  // The leaderboard with the WhatsApp tag, and the challenge when it is not the hub's default.
  function hubLink(id, defaultId) {
    return HUB_LINK + (id && id !== defaultId ? '#/c/' + encodeURIComponent(id) : '');
  }

  // WhatsApp with the text typed and a chat picker.
  function waLink(text) {
    return 'https://wa.me/?text=' + encodeURIComponent(String(text == null ? '' : text));
  }

  // Characters as a reader counts them: an emoji is one.
  function charCount(text) {
    var s = String(text == null ? '' : text);
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      var n = 0;
      var it = new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)[Symbol.iterator]();
      while (!it.next().done) n++;
      return n;
    }
    return Array.from(s).length;
  }

  var MARK_RE = /(\*[^*\n]+\*|_[^_\n]+_|https?:\/\/\S+)/g;

  // A message as WhatsApp shows it, in parts: one array per line of { text, bold?, italic?, link? }.
  // Never HTML, so nothing in the data can become markup.
  function previewParts(text) {
    return String(text == null ? '' : text).split('\n').map(function (line) {
      var parts = [];
      var last = 0;
      line.replace(MARK_RE, function (m, whole, at) {
        if (at > last) parts.push({ text: line.slice(last, at) });
        if (m.charAt(0) === '*') parts.push({ text: m.slice(1, -1), bold: true });
        else if (m.charAt(0) === '_') parts.push({ text: m.slice(1, -1), italic: true });
        else parts.push({ text: m, link: true });
        last = at + m.length;
        return m;
      });
      if (last < line.length) parts.push({ text: line.slice(last) });
      return parts;
    });
  }

  // 'take-a-step-trip-f26-2026-10-14-whatsapp-day.png'
  function fileName(id, today, which) {
    return id + '-' + today + '-whatsapp-' + which + '.png';
  }

  Object.assign(api, {
    HUB_LINK: HUB_LINK,
    WORDINGS: WORDINGS,
    emojiFor: emojiFor,
    hubLink: hubLink,
    waLink: waLink,
    charCount: charCount,
    previewParts: previewParts,
    fileName: fileName
  });

  // ---------- section B: the kind of day, the day's fact, the picture of the day ----------

  // 'daily', 'week', 'stretch' or 'finish', by the rule of the stories' opener. null before the
  // start or without readable dates.
  function dayKind(f) {
    if (!f || !f.count || f.state === 'before') return null;
    if (f.state === 'finish') return 'finish';
    if (f.count.daysLeft >= 1 && f.count.daysLeft <= 3) return 'stretch';
    if (f.count.day % 7 === 0) return 'week';
    return 'daily';
  }

  function wordingOf(plan) {
    var n = (plan.day - 1 + plan.shuffle) % 3;
    return n < 0 ? n + 3 : n;
  }

  // The day's wording of one line, its tokens filled.
  function say(f, plan, key) {
    var c = f.count;
    return S.fillTokens(WORDINGS[key][wordingOf(plan)], {
      challenge: f.name,
      day: c.day,
      days: c.days,
      week: Math.max(1, Math.floor(c.day / 7)),
      daysLeft: L.daysText(c.daysLeft),
      formLabel: f.formLabel,
      unit: f.unit,
      unitOne: f.unitOne
    });
  }

  // The divisions whose leading hall has a total above 0.
  function leading(f) {
    return f.sections.filter(function (s) { return s.halls.length && s.halls[0].points > 0; });
  }

  // The first feature story in today's set: the one the day's fact is about. null when none.
  function firstFeature(plan) {
    return plan.stories.filter(function (s) { return s.on && S.FEATURES.indexOf(s.type) >= 0; })[0] || null;
  }

  // The people a top line names: the top walker of each division, or the top 3 without divisions.
  function topPeople(f) {
    if (f.split) return f.sections.map(function (s) { return s.rows[0]; }).filter(Boolean);
    return f.sections.length ? f.sections[0].rows.slice(0, 3) : [];
  }

  // 'Vera E. (GHw)', or 'a GHw resident' with No names. mark: how the hall code is written. A
  // person with no hall yet (off the roster) is named without one: 'Vera E.', 'a resident'.
  function person(r, names, mark) {
    var m = mark || plain;
    if (!r.hall) return S.shownName(r.name, names, '');
    return names === 'none' ? 'a ' + m(r.hall) + ' resident' : S.shownName(r.name, names, r.hall) + ' (' + m(r.hall) + ')';
  }

  function boldLead(line) {
    return line.replace(/^(\S+)/, '*$1*');
  }

  // The day's fact from one feature story: { type, sentence (WhatsApp text), panel (for the day
  // card) }, or null. opts: { look, names }.
  function dayFact(f, story, opts) {
    if (!story) return null;
    var o = isObject(opts) ? opts : {};
    var look = o.look || 'journal';
    var c = S.storyContent(f, story, { look: look, names: o.names });
    if (!c) return null;
    var t = story.type;
    var unitFor = function (value) { return value === '1' ? f.unitOne : f.unit; };
    if (t === 'race') {
      return {
        type: t,
        sentence: 'Closest race: ' + bold(c.a.code) + ' and ' + bold(c.b.code) + ' are ' + c.gap + ' ' + c.gapLabel + (f.split ? ' in the ' + lowerFirst(c.label) : '') + '.',
        panel: { label: 'Closest race' + (f.split ? ': ' + c.label : ''), chips: [c.a, c.b], vs: true, big: c.gap, bigLabel: c.gapLabel, lines: c.other ? [c.other] : [] }
      };
    }
    if (t === 'spotlight') {
      var by = unitFor(c.value) + ' by ' + c.residents;
      return {
        type: t,
        sentence: 'Hall spotlight: ' + bold(c.code) + ', ' + c.place + ', with ' + c.value + ' ' + by + '.' + (c.next ? ' ' + c.next : ''),
        panel: { label: 'Hall spotlight', chips: [c], chipNote: c.place, big: c.value, bigLabel: by, lines: c.next ? [c.next] : [] }
      };
    }
    if (t === 'route') {
      if (!c.lines.length) return null;
      return {
        type: t,
        sentence: 'On the road: ' + c.lines.map(boldLead).join(' '),
        panel: { label: 'On the road', chips: c.lanes.filter(function (l) { return l.halls.length; }).map(function (l) { return l.halls[0]; }), lines: c.lines }
      };
    }
    var secs = leading(f);
    if (t === 'leaders') {
      var leads = secs.map(function (s, i) {
        return bold(s.halls[0].code) + (f.split ? (i === 0 ? ' leads the ' : ' the ') + lowerFirst(s.label) : ' leads with ' + amount(f, s.halls[0].points));
      });
      return {
        type: t,
        sentence: andList(leads) + '.',
        panel: { label: 'Leading the halls', chips: c.groups, lines: c.groups.map(function (g) { return g.code + ' ' + g.line + '.'; }) }
      };
    }
    if (t === 'standings') {
      if (!secs.length) return null;
      var withs = secs.map(function (s, i) {
        var p = s.halls[0].points;
        return bold(s.halls[0].code) + ' with ' + (i === 0 ? amount(f, p) : L.formatNumber(p));
      });
      return {
        type: t,
        sentence: 'Leading the halls: ' + andList(withs) + '.',
        panel: {
          label: 'Leading the halls',
          chips: secs.map(function (s) { return S.hallChip(f, look, s.halls[0]); }),
          lines: secs.map(function (s) {
            return s.halls[0].code + (f.split ? ' leads the ' + lowerFirst(s.label) : ' leads') + ' with ' + amount(f, s.halls[0].points) + '.';
          })
        }
      };
    }
    if (t === 'top') {
      var people = topPeople(f);
      if (!people.length) return null;
      var named = people.map(function (r, i) {
        return person(r, o.names, bold) + ' with ' + L.formatNumber(r.points) + (i === 0 ? ' ' + L.unitWord(f.unit, r.points) : '');
      });
      return {
        type: t,
        sentence: f.topLabel + ': ' + andList(named) + '.',
        panel: {
          label: f.topLabel,
          chips: [],
          lines: people.map(function (r) { return person(r, o.names) + ', ' + amount(f, r.points); })
        }
      };
    }
    if (t === 'poll') {
      return {
        type: t,
        sentence: 'Your call: ' + lowerFirst(c.question).replace(/\?$/, '') + ', ' + bold(c.a.code) + ' or ' + bold(c.b.code) + '?',
        panel: { label: 'Your call', question: c.question, chips: [c.a, c.b], vs: true, lines: [c.hint] }
      };
    }
    return null;
  }

  // The picture of the day: { auto, chosen }, each 'day' or 'standings'. auto is the standings
  // card when today's set has the Hall standings story in it (never at the finish); saved.card,
  // the switch, overrides it. null when there are no messages today.
  function pictureOfDay(f, plan, saved) {
    var kind = dayKind(f);
    if (!kind) return null;
    var hasStandings = plan.stories.some(function (s) { return s.on && s.type === 'standings'; });
    var auto = kind !== 'finish' && hasStandings ? 'standings' : 'day';
    var want = isObject(saved) && (saved.card === 'day' || saved.card === 'standings') ? saved.card : auto;
    return { auto: auto, chosen: want === 'standings' && !S.available(f).standings ? 'day' : want };
  }

  Object.assign(api, {
    dayKind: dayKind,
    dayFact: dayFact,
    firstFeature: firstFeature,
    pictureOfDay: pictureOfDay
  });

  // ---------- section C: the messages ----------

  function totalLine(f, tail) {
    return bold(amount(f, f.totals.points)) + ' ' + tail + ', by ' + residents(f.totals.participants) + '.';
  }

  // The halls in first place in a division: one, or every hall level at the top.
  function firstPlace(s) {
    return s.halls.filter(function (h) { return h.rank === 1; });
  }

  // One line per division about its leader's lead: 'GHw leads the women's halls by 125,324 steps.'
  // Halls level at the top share the lead, all of them named.
  function leadLines(f, mark) {
    return leading(f).map(function (s) {
      var first = firstPlace(s);
      if (first.length > 1) {
        return andList(first.map(function (h) { return mark(h.code); })) + ' share the lead' + (f.split ? ' in the ' + lowerFirst(s.label) : '') + '.';
      }
      var a = s.halls[0];
      var b = s.halls[1];
      return mark(a.code) + ' leads' + (f.split ? ' the ' + lowerFirst(s.label) : '') + (b ? ' by ' + amount(f, a.points - b.points) : '') + '.';
    });
  }

  // 'GHw finished first in the women's halls and KLm in the men's halls.' withTotal adds each
  // division's winning total.
  function winnersLine(f, mark, withTotal) {
    var parts = leading(f).map(function (s, i) {
      var first = firstPlace(s);
      return andList(first.map(function (h) { return mark(h.code); })) + (i === 0 ? ' finished first' : '') +
        (f.split ? ' in the ' + lowerFirst(s.label) : '') + (withTotal ? ' with ' + amount(f, first[0].points) : '');
    });
    return parts.length ? andList(parts) + '.' : '';
  }

  function closingLine(f) {
    return f.final ? 'Final results are on the leaderboard.' : 'Winners are confirmed by the EcoReps.';
  }

  function weekStory(f, plan) {
    return S.storyContent(f, { type: 'week', occurrence: 0, wording: wordingOf(plan), headline: '' }, { look: 'journal' });
  }

  function versionA(f, plan, o) {
    var kind = dayKind(f);
    var emoji = emojiFor(f.icon);
    var c = f.count;
    if (kind === 'week') {
      var wk = weekStory(f, plan);
      return blocks([
        [emoji + ' ' + bold(say(f, plan, 'week')), wk ? italic(f.name + ', ' + wk.range) : ''],
        [totalLine(f, 'so far')].concat(wk ? wk.rows.slice(2).map(function (r) { return '- ' + r.label + ': ' + r.value; }) : []),
        [say(f, plan, 'log'), o.link]
      ]);
    }
    if (kind === 'stretch') {
      return blocks([
        ['⏳ ' + bold(say(f, plan, 'stretch')), italic(f.name + ', day ' + c.day + ' of ' + c.days)],
        [totalLine(f, 'so far')],
        leadLines(f, bold),
        ['Every ' + f.unitOne + ' counts now. Log yours:', o.link]
      ]);
    }
    if (kind === 'finish') {
      return blocks([
        ['🎉 ' + bold(say(f, plan, 'finish')), italic(f.name + ', ' + S.dayRange(f.startDate, f.endDate))],
        [totalLine(f, 'in ' + L.daysText(c.days))],
        [winnersLine(f, bold, false), closingLine(f)],
        [o.link]
      ]);
    }
    var fact = dayFact(f, firstFeature(plan), { names: o.names });
    return blocks([
      [emoji + ' ' + bold(say(f, plan, 'title'))],
      [totalLine(f, 'so far')],
      [fact ? fact.sentence : ''],
      [say(f, plan, 'log'), o.link]
    ]);
  }

  // One division's halls as a numbered list. The leader gets its place on the route, or on a
  // stretch day its lead; nothing at the finish.
  function hallLines(f, s, kind) {
    return s.halls.map(function (h, i) {
      var extra = '';
      var next = s.halls[1];
      if (i === 0 && h.points > 0 && kind === 'stretch') {
        if (next && h.points > next.points) extra = ', ahead by ' + L.formatNumber(h.points - next.points);
      } else if (i === 0 && h.points > 0 && kind !== 'finish' && h.position) {
        extra = ', ' + S.whereText(h.position);
      }
      return h.rank + '. ' + h.code + ' ' + L.formatNumber(h.points) + extra;
    });
  }

  function standingsBlocks(f, kind) {
    return f.sections.filter(function (s) { return s.halls.length; }).map(function (s) {
      return [bold(s.label || 'Halls')].concat(hallLines(f, s, kind));
    });
  }

  function versionB(f, plan, o) {
    var kind = dayKind(f);
    var emoji = emojiFor(f.icon);
    var rowLine = function (r) { return r.rank + '. ' + person(r, o.names) + ' ' + L.formatNumber(r.points); };
    if (kind === 'finish') {
      var tops = f.sections.filter(function (s) { return s.rows.length; });
      var topBlock = tops.length ? ['🏆 ' + bold(f.topLabel)].concat(f.split
        ? tops.reduce(function (all, s) { return all.concat([italic(s.label)], s.rows.slice(0, 3).map(rowLine)); }, [])
        : tops[0].rows.slice(0, 5).map(rowLine)) : [];
      return blocks([
        ['🎉 ' + bold('Final standings'), italic(f.name + ', ' + S.dayRange(f.startDate, f.endDate))]
      ].concat(standingsBlocks(f, kind), [topBlock, [closingLine(f), o.link]]));
    }
    var title = kind === 'week' ? emoji + ' ' + bold(say(f, plan, 'week'))
      : kind === 'stretch' ? '⏳ ' + bold(say(f, plan, 'stretch'))
        : emoji + ' ' + bold(say(f, plan, 'title'));
    var people = topPeople(f);
    var top = people.length ? '🏆 ' + bold(f.topLabel) + ': ' + people.map(function (r) { return person(r, o.names) + ' ' + L.formatNumber(r.points); }).join(', ') : '';
    return blocks([
      [title, f.asOf ? italic('Standings as of ' + f.asOf) : '']
    ].concat(standingsBlocks(f, kind), [[top], [say(f, plan, 'closing'), o.link]]));
  }

  function reminderText(f, plan, o) {
    return blocks([[
      '⏰ ' + bold(say(f, plan, 'reminder')),
      f.unit === 'steps' ? 'Check your step count, take a screenshot and log it.' : "Do today's task and log it.",
      f.daysBack >= 1 ? 'Forgot yesterday? You can still log it today.' : '',
      o.link
    ]]);
  }

  // Today's messages: { kind, a, b, reminder, poll }. reminder is '' after the end; poll is
  // { question, options } on a day whose set has the poll story, else null. null before the
  // start or while the numbers are not there. opts: { names, link }.
  function messages(f, plan, opts) {
    var kind = dayKind(f);
    if (!kind || !f.ready || !f.totals || !plan) return null;
    var o = isObject(opts) ? opts : {};
    var names = S.NAME_MODES.some(function (m) { return m.key === o.names; }) ? o.names : 'initial';
    var x = { names: names, link: typeof o.link === 'string' && o.link ? o.link : HUB_LINK };
    var pollStory = plan.stories.filter(function (s) { return s.on && s.type === 'poll'; })[0];
    return {
      kind: kind,
      a: versionA(f, plan, x),
      b: versionB(f, plan, x),
      reminder: kind === 'finish' ? '' : reminderText(f, plan, x),
      poll: pollStory ? S.pollHelper(S.storyContent(f, pollStory, { look: 'journal' })) : null
    };
  }

  Object.assign(api, {
    messages: messages
  });

  // ---------- section D: the cards' content ----------

  function dayCard(f, plan, look, names) {
    var kind = dayKind(f);
    var c = f.count;
    var w = wordingOf(plan);
    var base = S.storyContent(f, { type: 'cover', occurrence: 0, wording: w, headline: '' }, { look: look, names: names });
    if (!base) return null;
    var first = plan.stories[0];
    var opener = first && first.type === OPENER[kind] ? first : { type: OPENER[kind], occurrence: 0, wording: w, headline: '' };
    var oc = S.storyContent(f, opener, { look: look, names: names });
    var badge = base.badge;
    if (kind === 'week' && oc) badge = oc.badge;
    if (kind === 'stretch') badge = [L.formatNumber(c.daysLeft), c.daysLeft === 1 ? 'day left' : 'days left'];
    if (kind === 'finish') badge = [L.daysText(c.days), 'done'];
    var panel = null;
    if (kind === 'daily') {
      var fact = dayFact(f, firstFeature(plan), { look: look, names: names });
      panel = fact ? fact.panel : null;
    } else if (kind === 'week') {
      var wk = weekStory(f, plan);
      panel = wk ? { label: 'This week: ' + wk.range, rows: wk.rows.slice(2) } : null;
    } else {
      var secs = leading(f);
      // Every hall in first place gets a chip, so a tie never reads as one winner.
      var chips = secs.reduce(function (all, s) { return all.concat(firstPlace(s)); }, []).map(function (h) { return S.hallChip(f, look, h); });
      if (secs.length && kind === 'stretch') panel = { label: 'The race to the finish', chips: chips, lines: leadLines(f, plain) };
      if (secs.length && kind === 'finish') panel = { label: 'Finished first', chips: chips, lines: [winnersLine(f, plain, true), closingLine(f)] };
    }
    return Object.assign({}, base, {
      card: 'day',
      kind: kind,
      headline: oc ? oc.headline : base.headline,
      badge: badge,
      totalLine: kind === 'finish' ? f.unit + ' in ' + L.daysText(c.days) + ', by ' + residents(f.totals.participants) : base.totalLine,
      panel: panel,
      foot: (f.asOf ? 'As of ' + f.asOf + '. ' : '') + SITE
    });
  }

  function standingsCard(f, plan, look, names) {
    var kind = dayKind(f);
    var st = plan.stories.filter(function (s) { return s.type === 'standings'; })[0] ||
      { type: 'standings', occurrence: 0, wording: wordingOf(plan), headline: '' };
    var c = S.storyContent(f, st, { look: look, names: names });
    if (!c) return null;
    var people = topPeople(f);
    return Object.assign({}, c, {
      card: 'standings',
      kind: kind,
      headline: kind === 'finish' && !st.headline ? 'Final standings' : c.headline,
      walkers: people.length ? f.topLabel + ': ' + people.map(function (r) { return person(r, names); }).join(', ') : '',
      foot: (c.barNote ? c.barNote + '. ' : '') + c.asOf
    });
  }

  // What a card shows, for wa-draw.js, or null. which: 'day' or 'standings'; opts: { look, names }.
  function cardContent(f, plan, which, opts) {
    if (!f || !f.ready || !f.totals || !plan || !dayKind(f)) return null;
    var o = isObject(opts) ? opts : {};
    var look = S.LOOKS.some(function (l) { return l.key === o.look; }) ? o.look : plan.look;
    var names = S.NAME_MODES.some(function (m) { return m.key === o.names; }) ? o.names : 'initial';
    return which === 'standings' ? standingsCard(f, plan, look, names) : dayCard(f, plan, look, names);
  }

  Object.assign(api, {
    cardContent: cardContent
  });

  return api;
});
