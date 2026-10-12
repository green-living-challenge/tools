/* GLC tools: the story maker's layouts, one per story type. Each one places the parts of the
   story's content (story-plan.js storyContent) through the look's skin (story-looks.js) on a kit
   session (story-kit.js). Browser only: window.GLCStoryDraw.
   Spec: docs/superpowers/specs/2026-10-12-story-maker-design.md, sections 2 and 4. */
(function () {
  'use strict';

  var Kit = window.GLCStoryKit;
  var Looks = window.GLCStoryLooks;
  var X0 = 80;
  var X1 = 1000;
  var CW = X1 - X0;
  var TOP = 270;
  var END = 1560;

  function cover(k, s, c) {
    var y = TOP;
    y += s.logos(k, c, y) + 60;
    y += s.kicker(k, c, c.kicker, X0, y) + 18;
    var t = s.title(k, c, c.headline, X0, y, { maxWidth: 600, maxLines: 3 });
    s.badge(k, c, c.badge, 850, y + 150);
    y += Math.max(t, 300) + 70;
    y += s.big(k, c, c.total, X0, y) + 6;
    y += s.body(k, c, c.totalLine, X0, y) + 40;
    if (c.tagline) {
      y += s.rule(k, c, y) + 40;
      s.aside(k, c, c.tagline, X0, y);
    }
    s.note(k, c, c.asOf);
  }

  function week(k, s, c) {
    var y = TOP;
    var t = s.title(k, c, c.headline, X0, y, { maxWidth: 600, maxLines: 2 });
    s.badge(k, c, c.badge, 850, y + 130, { r: 120 });
    y += Math.max(t, 260) + 40;
    y += s.kicker(k, c, c.range, X0, y) + 24;
    c.rows.forEach(function (r) {
      y += s.statRow(k, c, y, r.label, r.value) + 18;
    });
    s.note(k, c, c.asOf);
  }

  function stretch(k, s, c) {
    var y = TOP;
    y += s.title(k, c, c.headline, X0, y, { maxWidth: CW, maxLines: 2 }) + 20;
    y += s.giant(k, c, c.big, X0, y) + 10;
    y += s.body(k, c, c.bigLabel, X0, y, { size: 90, bold: true, maxLines: 1 }) + 60;
    c.lines.forEach(function (line) {
      y += s.body(k, c, line, X0, y, { size: 50 }) + 16;
    });
    y += 30;
    s.aside(k, c, c.closing, X0, y);
    s.note(k, c, c.asOf);
  }

  // Places labels centred on their wanted y, pushing them apart so none overlap. items: [{ y, h }]
  // sorted from the top; returns the centres.
  function spread(items, gap, top, bottom) {
    var out = items.map(function (it) { return it.y; });
    for (var i = 1; i < items.length; i++) {
      var min = out[i - 1] + items[i - 1].h / 2 + items[i].h / 2 + gap;
      if (out[i] < min) out[i] = min;
    }
    var over = out.length ? out[out.length - 1] + items[items.length - 1].h / 2 - bottom : 0;
    if (over > 0) {
      for (var j = out.length - 1; j >= 0; j--) {
        out[j] -= over;
        if (j > 0) {
          var max = out[j] - items[j].h / 2 - items[j - 1].h / 2 - gap;
          if (out[j - 1] <= max) break;
          over = out[j - 1] - max;
        }
      }
    }
    if (out.length && out[0] - items[0].h / 2 < top) out[0] = top + items[0].h / 2;
    return out;
  }

  // Where a hall chip goes: the column and centre nearest its place on the lane that keeps 62 px
  // from every chip already in that column, within lo to hi. placed: [{ col, y }].
  function chipSpot(placed, cols, want, lo, hi) {
    var best = null;
    for (var col = 0; col < cols; col++) {
      var taken = placed.filter(function (p) { return p.col === col; }).map(function (p) { return p.y; });
      var tries = [want];
      taken.forEach(function (y) { tries.push(y - 62, y + 62); });
      tries.forEach(function (y) {
        if (y < lo || y > hi) return;
        if (taken.some(function (t) { return Math.abs(t - y) < 62 - 0.5; })) return;
        if (!best || Math.abs(y - want) < Math.abs(best.y - want)) best = { col: col, y: y };
      });
    }
    return best || { col: 0, y: Math.max(lo, Math.min(hi, want)) };
  }

  function route(k, s, c) {
    var col = s.colors(c);
    var y = TOP;
    y += s.title(k, c, c.headline, X0, y, { maxWidth: CW, maxLines: 1 }) + 40;
    var two = c.lanes.length === 2;
    var lanes = two ? [360, 720] : [380];
    var top = y + 80;
    var bottom = 1380;
    var span = bottom - top;
    c.lanes.forEach(function (lane, i) {
      if (two) s.kicker(k, c, lane.label.replace(/ halls$/, ''), lanes[i], y, { align: 'center', maxWidth: 300, size: 28 });
      k.line(lanes[i], top, lanes[i], bottom, { color: col.line, width: 10, dash: [2, 22], cap: 'round' });
    });
    var left = two ? lanes[0] : lanes[0];
    var right = two ? lanes[1] : lanes[0] + 60;
    var stopsDown = c.stops.slice().reverse();
    var labelFont = { family: 'StoryInter', weight: '600', size: 26 };
    var labelW = two ? 280 : X1 - (lanes[0] + 50);
    var items = stopsDown.map(function (st) {
      var lines = k.measure(st.label, labelFont) > labelW ? 2 : 1;
      return { y: bottom - st.at * span, h: lines * 26 * 1.15 + 10, label: st.label };
    });
    var centres = spread(items, 4, top - 30, bottom + 30);
    items.forEach(function (it, i) {
      k.line(left, it.y, right, it.y, { color: col.soft, width: 3, dash: [8, 10] });
      lanes.forEach(function (x) { k.circle(x, it.y, i === 0 || i === items.length - 1 ? 16 : 12, { fill: col.accent, stroke: col.line, lineWidth: 5 }); });
      var cy = centres[i];
      if (two) {
        k.rect(540 - labelW / 2, cy - it.h / 2, labelW, it.h, { fill: col.bg, radius: 10 });
        k.wrap(it.label, 540, cy - it.h / 2 + 5, Object.assign({}, labelFont, { color: col.ink, align: 'center', maxWidth: labelW - 16, maxLines: 2, lineHeight: 1.15 }));
      } else {
        k.wrap(it.label, lanes[0] + 50, cy - it.h / 2 + 5, Object.assign({}, labelFont, { color: col.ink, maxWidth: labelW, maxLines: 2, lineHeight: 1.15 }));
      }
    });
    c.lanes.forEach(function (lane, i) {
      var x = lanes[i];
      var outward = two && i === 1 ? 1 : -1;
      var room = outward > 0 ? X1 - (x + 30) : x - 30 - X0;
      var label = function (h) { return h.lap ? h.code + ' L' + h.lap : h.code; };
      // Columns as wide as the widest chip (measured in the widest chip font), as many as fit.
      var colW = lane.halls.reduce(function (m, h) {
        return Math.max(m, k.measure(label(h), { family: 'StoryInter', weight: '800', size: 32 }) + 46 + 8);
      }, 0);
      var cols = Math.max(1, Math.min(2, Math.floor((room + 8) / colW)));
      var placed = [];
      var chips = lane.halls.slice().sort(function (a, b) { return b.at - a.at; }).map(function (h) {
        var want = bottom - h.at * span;
        var spot = chipSpot(placed, cols, want, top, bottom + 20);
        placed.push(spot);
        return { h: h, want: want, y: spot.y, edge: x + outward * (30 + spot.col * colW) };
      });
      // Every connector first, then the chips over them, so no line crosses a chip.
      chips.forEach(function (p) { k.line(x, p.want, p.edge, p.y, { color: p.h.color, width: 5 }); });
      chips.forEach(function (p) {
        s.chip(k, c, label(p.h), p.edge, p.y - 29, p.h.color, p.h.onColor, { align: outward > 0 ? 'left' : 'right' });
      });
    });
    var ly = bottom + 50;
    c.lines.forEach(function (line) {
      ly += s.body(k, c, line, X0, ly, { size: 38, maxLines: 2 }) + 8;
    });
    s.note(k, c, c.asOf);
  }

  function standings(k, s, c) {
    var y = TOP;
    y += s.title(k, c, c.headline, X0, y, { maxWidth: CW, maxLines: 1 }) + 30;
    var rows = c.groups.reduce(function (n, g) { return n + g.rows.length; }, 0);
    var extra = c.groups.length * (c.groups.length > 1 ? 110 : 30) + c.groups.filter(function (g) { return g.more; }).length * 50;
    var h = Math.max(64, Math.min(104, Math.floor((END - y - extra) / rows) - 12));
    c.groups.forEach(function (g) {
      if (c.groups.length > 1) y += s.kicker(k, c, g.label, X0, y) + 18;
      g.rows.forEach(function (r) {
        y += s.barRow(k, c, y, r, h) + 12;
      });
      if (g.more) y += s.body(k, c, g.more, X0, y, { size: 32, soft: true, maxLines: 1 }) + 8;
      y += 30;
    });
    s.note(k, c, c.barNote ? c.barNote + '. ' + c.asOf : c.asOf);
  }

  function top(k, s, c) {
    var y = TOP;
    y += s.title(k, c, c.headline, X0, y, { maxWidth: CW, maxLines: 1 }) + 30;
    var rows = c.groups.reduce(function (n, g) { return n + g.rows.length; }, 0);
    var extra = c.groups.length * (c.groups.length > 1 ? 116 : 36) + (c.prizes ? 130 : 0);
    var h = Math.max(90, Math.min(126, Math.floor((END - y - extra) / rows) - 16));
    c.groups.forEach(function (g) {
      if (c.groups.length > 1) y += s.kicker(k, c, g.label, X0, y) + 18;
      g.rows.forEach(function (r) {
        y += s.rankRow(k, c, y, { rank: r.rank, title: r.name, sub: r.hall, value: r.value, valueSub: c.unit, color: r.color, onColor: r.onColor }, h) + 16;
      });
      y += 36;
    });
    if (c.prizes) s.aside(k, c, c.prizes, X0, y, { size: 46 });
    s.note(k, c, c.asOf);
  }

  function leaders(k, s, c) {
    var halves = c.look === 'bigfact';
    var y = TOP;
    if (halves && c.groups.length === 2) {
      k.rect(0, 0, 1080, 960, { fill: c.groups[0].color, background: true });
      k.rect(0, 960, 1080, 960, { fill: c.groups[1].color, background: true });
    } else if (halves) {
      k.rect(0, 0, 1080, 1920, { fill: c.groups[0].color, background: true });
    }
    c.groups.forEach(function (g, i) {
      var cc = halves ? Object.assign({}, c, { surface: { bg: g.color, fg: g.onColor, big: g.onColor } }) : c;
      if (i === 0) y += s.title(k, cc, c.headline, X0, y, { maxWidth: CW, maxLines: 1 }) + 40;
      if (halves && i === 1) y = Math.max(y, 1010);
      y += s.kicker(k, cc, g.label, X0, y) + 14;
      y += s.hallName(k, cc, g.code, X0, y, g.color, g.onColor) + 16;
      y += s.body(k, cc, g.line, X0, y, { size: 46, maxLines: 2 }) + 6;
      if (g.sub) y += s.body(k, cc, g.sub, X0, y, { size: 38, soft: true, maxLines: 2, light: true });
      y += 70;
    });
    var last = halves ? Object.assign({}, c, { surface: { bg: c.groups[c.groups.length - 1].color, fg: c.groups[c.groups.length - 1].onColor, big: c.groups[c.groups.length - 1].onColor } }) : c;
    s.note(k, last, c.asOf);
  }

  // A small trail: the route from start to finish, its stops, and one hall's place on it.
  function trail(k, s, c, y, stops, at, color) {
    var col = s.colors(c);
    // Inset so the hall's marker (radius 26 and its outline) stays inside at either end.
    var a = X0 + 30;
    var b = X1 - 30;
    var yy = y + 30;
    k.line(a, yy, b, yy, { color: col.line, width: 8, dash: [2, 18], cap: 'round' });
    k.line(a, yy, a + (b - a) * Math.min(1, at), yy, { color: color, width: 14, cap: 'round' });
    stops.forEach(function (st) {
      k.circle(a + (b - a) * st.at, yy, 10, { fill: col.accent, stroke: col.line, lineWidth: 4 });
    });
    k.circle(a + (b - a) * Math.min(1, at), yy, 26, { fill: color, stroke: col.bg, lineWidth: 6 });
    var f = { family: 'StoryInter', weight: '600', size: 30, color: col.ink };
    k.text(stops[0].label, a, yy + 40, Object.assign({}, f, { maxWidth: 260 }));
    k.text(stops[stops.length - 1].label, b, yy + 40, Object.assign({}, f, { align: 'right', maxWidth: 300 }));
    return 110;
  }

  function spotlight(k, s, c) {
    var y = TOP;
    var t = s.title(k, c, c.headline, X0, y, { maxWidth: 600, maxLines: 2, size: c.look === 'journal' ? 110 : c.look === 'scoreboard' ? 110 : 84 });
    s.badge(k, c, [c.placeShort, 'place'], 850, y + 120, { r: 115 });
    y += Math.max(t, 220) + 30;
    y += s.hallName(k, c, c.code, X0, y, c.color, c.onColor) + 20;
    y += s.body(k, c, c.place, X0, y, { size: 44 }) + 30;
    y += s.big(k, c, c.value, X0, y, { size: c.look === 'scoreboard' ? 200 : 160 }) + 4;
    y += s.body(k, c, c.unit + ' by ' + c.residents, X0, y, { size: 44, soft: true }) + 40;
    if (c.at !== null && c.stops.length) {
      y += trail(k, s, c, y, c.stops, c.at, c.look === 'bigfact' ? c.surface.fg : c.color) + 20;
      s.aside(k, c, c.next, X0, y);
    }
    s.note(k, c, c.asOf);
  }

  function race(k, s, c) {
    var col = s.colors(c);
    var y = TOP;
    y += s.title(k, c, c.headline, X0, y, { maxWidth: CW, maxLines: 1 }) + 20;
    y += s.kicker(k, c, c.label, X0, y) + 50;
    var f = c.look === 'scoreboard' ? { family: 'StoryAnton', weight: '400' } : c.look === 'bigfact' ? { family: 'StoryArchivo', weight: '400' } : { family: 'StoryInter', weight: '800' };
    var sideColor = function (h) { return c.look === 'bigfact' ? c.surface.fg : h.color; };
    k.text(c.a.code, 280, y, Object.assign({}, f, { size: 200, minSize: 90, color: sideColor(c.a), align: 'center', maxWidth: 330, lineHeight: 1.05 }));
    k.text('vs', 540, y + 70, Object.assign({}, f, { size: 70, color: col.strong, align: 'center', caps: true }));
    k.text(c.b.code, 800, y, Object.assign({}, f, { size: 200, minSize: 90, color: sideColor(c.b), align: 'center', maxWidth: 330, lineHeight: 1.05 }));
    y += 230;
    k.text(c.a.value, 280, y, { family: 'StoryInter', weight: '600', size: 44, color: col.ink, align: 'center', maxWidth: 330 });
    k.text(c.b.value, 800, y, { family: 'StoryInter', weight: '600', size: 44, color: col.ink, align: 'center', maxWidth: 330 });
    y += 120;
    y += s.big(k, c, c.gap, 540, y, { align: 'center', size: c.look === 'scoreboard' ? 300 : 220, maxWidth: CW }) + 10;
    y += s.kicker(k, c, c.gapLabel, 540, y, { align: 'center', size: c.look === 'scoreboard' ? 80 : 44, maxWidth: CW }) + 70;
    if (c.other) s.body(k, c, c.other, 540, y, { size: 40, align: 'center', soft: true, maxWidth: CW, light: true });
    s.note(k, c, c.asOf);
  }

  function poll(k, s, c) {
    var y = TOP;
    y += s.kicker(k, c, c.headline, X0, y) + 24;
    y += s.title(k, c, c.question, X0, y, { maxWidth: CW, maxLines: 3, size: c.look === 'journal' ? 130 : c.look === 'scoreboard' ? 130 : 104 }) + 40;
    // The empty space where the EcoRep puts Instagram's poll sticker.
    y = Math.max(y + 440, 1200);
    s.body(k, c, c.hint, X0, y, { size: 42, maxLines: 3, light: true });
    s.note(k, c, c.asOf);
  }

  function log(k, s, c) {
    var col = s.colors(c);
    var y = TOP;
    var t = s.title(k, c, c.headline, X0, y, { maxWidth: 600, maxLines: 2 });
    s.badge(k, c, c.badge, 850, y + 130, { r: 120 });
    y += Math.max(t, 280) + 30;
    y += s.body(k, c, c.formLabel, X0, y, { size: 64, bold: true }) + 30;
    c.steps.forEach(function (step, i) {
      y += s.body(k, c, (i + 1) + '. ' + step, X0, y, { size: 44, maxLines: 1 }) + 14;
    });
    y += 40;
    y += s.rule(k, c, y) + 50;
    y += s.aside(k, c, c.sticker, 540, y, { align: 'center', maxWidth: CW }) + 20;
    k.arrow(540, y, 110, col.accent);
    // Below the arrow: the empty space for the link sticker.
  }

  function finish(k, s, c) {
    var y = TOP;
    y += s.logos(k, c, y) + 60;
    y += s.kicker(k, c, c.kicker, X0, y) + 18;
    y += s.title(k, c, c.headline, X0, y, { maxWidth: CW, maxLines: 2 }) + 70;
    y += s.big(k, c, c.total, X0, y) + 6;
    y += s.body(k, c, c.totalLine, X0, y) + 40;
    y += s.rule(k, c, y) + 40;
    s.body(k, c, c.line, X0, y, { size: 54 });
    s.note(k, c, c.asOf);
  }

  function thanks(k, s, c) {
    var col = s.colors(c);
    var y = TOP + 80;
    y += s.title(k, c, c.headline, X0, y, { maxWidth: CW, maxLines: 3 }) + 60;
    y += s.body(k, c, c.line, X0, y, { size: 54, maxLines: 3 }) + 120;
    y += s.aside(k, c, c.sticker, 540, y, { align: 'center', maxWidth: CW }) + 20;
    k.arrow(540, y, 110, col.accent);
  }

  var LAYOUTS = {
    cover: cover, week: week, stretch: stretch, route: route, standings: standings, top: top,
    leaders: leaders, spotlight: spotlight, race: race, poll: poll, log: log, finish: finish, thanks: thanks
  };

  // Draws one story's content on canvas. Returns the kit's problems ([] when clean).
  function draw(canvas, content) {
    var k = Kit.session(canvas);
    var s = Looks[content.look] || Looks.journal;
    s.background(k, content);
    LAYOUTS[content.type](k, s, content);
    return k.problems();
  }

  window.GLCStoryDraw = { draw: draw, TYPES: Object.keys(LAYOUTS) };
})();
