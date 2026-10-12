/* GLC tools: the story maker's three looks. Each look is a skin: its background, its fonts, and how
   it draws a title, a big number, a badge, a hall chip, a row and a bar. The layouts in
   story-draw.js only place these. Browser only: window.GLCStoryLooks, loaded after hub-logic.js
   and story-kit.js. Spec: docs/superpowers/specs/2026-10-12-story-maker-design.md, section 4. */
(function () {
  'use strict';

  var X0 = 80;
  var X1 = 1000;
  var NOTE_Y = 1594;
  var mix = window.GLCLogic.mixHex;

  function font(family, weight, size) {
    return { family: family, weight: weight, size: size };
  }

  function inter(weight, size) {
    return font('StoryInter', weight, size);
  }

  function opts(base, o) {
    return Object.assign(base, o || {});
  }

  // AUS Sustainability on the left, Student Residential Life on the right. Returns the height.
  function logos(k, c, y, color) {
    var h = 80;
    k.logo('aus', X0, y, h, color, c.surface.bg);
    k.logo('srl', X1 - k.logoWidth('srl', h), y, h, color, c.surface.bg);
    return h;
  }

  // A pill holding a hall code. o.align: 'left' (x is the left edge), 'right' or 'center'.
  function pill(k, code, x, y, color, onColor, o) {
    var h = o.h || 58;
    var f = opts(inter('800', Math.round(h * 0.55)), { family: o.family || 'StoryInter', weight: o.family ? '400' : '800' });
    var w = k.measure(code, f) + h * 0.8;
    var left = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    k.rect(left, y, w, h, { fill: color, radius: o.radius === undefined ? h / 2 : o.radius });
    k.text(code, left + w / 2, y + (h - f.size * 1.15) / 2 + f.size * 0.04, opts(f, { color: onColor, align: 'center' }));
    return w;
  }

  // ---------- Journal: cream paper, hand font, stamps, ticket rows ----------

  var journal = {
    key: 'journal',
    colors: function (c) {
      var p = c.pal;
      return { ink: p.fg, strong: p.head, soft: p.muted, accent: p.stamp, track: p.dots, line: p.head, card: p.card, bg: p.bg };
    },
    background: function (k, c) {
      k.fill(c.pal.bg);
      k.dots(c.pal.dots, 46, 3.5);
    },
    logos: function (k, c, y) {
      return logos(k, c, y, c.pal.head);
    },
    kicker: function (k, c, s, x, y, o) {
      return k.text(s, x, y, opts(inter('800', 32), opts({ color: c.pal.head, caps: true, spacing: 7, maxWidth: X1 - x, ellipsis: true }, o))).height;
    },
    title: function (k, c, s, x, y, o) {
      return k.wrap(s, x, y, opts(font('StoryHand', '400', 150), opts({ color: c.pal.head, lineHeight: 1.0, maxWidth: X1 - x, maxLines: 2, minSize: 80, ellipsis: true }, o))).height;
    },
    big: function (k, c, s, x, y, o) {
      return k.text(s, x, y, opts(inter('800', 190), opts({ color: c.pal.head, maxWidth: X1 - x, minSize: 100, lineHeight: 1.1 }, o))).height;
    },
    giant: function (k, c, s, x, y, o) {
      return k.text(s, x, y, opts(inter('800', 420), opts({ color: c.pal.stamp, maxWidth: X1 - x, lineHeight: 1.0 }, o))).height;
    },
    body: function (k, c, s, x, y, o) {
      var b = o && o.bold;
      return k.wrap(s, x, y, opts(inter(b ? '800' : '600', 48), opts({ color: o && o.soft ? c.pal.muted : c.pal.fg, maxWidth: X1 - x, maxLines: 2 }, o))).height;
    },
    aside: function (k, c, s, x, y, o) {
      return k.wrap(s, x, y, opts(font('StoryHand', '400', 64), opts({ color: c.pal.head, lineHeight: 1.15, maxWidth: X1 - x, maxLines: 2, ellipsis: true }, o))).height;
    },
    note: function (k, c, s) {
      if (s) k.text(s, X0, NOTE_Y, opts(inter('600', 28), { color: c.pal.muted, maxWidth: X1 - X0 }));
    },
    rule: function (k, c, y) {
      k.line(X0, y, X1, y, { color: c.pal.muted, width: 5, dash: [14, 14] });
      return 5;
    },
    badge: function (k, c, lines, x, cy, o) {
      var r = (o && o.r) || 140;
      var color = c.pal.stamp;
      var cx = Math.min(x, X1 - r - 6);
      k.circle(cx, cy, r, { stroke: color, lineWidth: 12 });
      k.rotated(cx, cy, -12, function () {
        k.text(lines[0], cx, cy - r * 0.52, opts(font('StoryAnton', '400', Math.round(r * 0.62)), { color: color, align: 'center', caps: true, maxWidth: r * 1.55, lineHeight: 1.05 }));
        k.text(lines[1], cx, cy + r * 0.18, opts(font('StoryAnton', '400', Math.round(r * 0.3)), { color: color, align: 'center', caps: true, maxWidth: r * 1.4, lineHeight: 1.05 }));
      });
    },
    chip: function (k, c, code, x, y, color, onColor, o) {
      return pill(k, code, x, y, color, onColor, o || {});
    },
    hallName: function (k, c, code, x, y, color, onColor) {
      pill(k, code, x, y, color, onColor, { h: 170 });
      return 170;
    },
    statRow: function (k, c, y, label, value) {
      var h = 112;
      k.rect(X0, y, X1 - X0, h, { fill: c.pal.card, radius: 18 });
      var v = k.text(value, X1 - 36, y + 26, opts(inter('800', 50), { color: c.pal.head, align: 'right', maxWidth: 400 }));
      k.text(label, X0 + 36, y + 32, opts(inter('600', 40), { color: c.pal.fg, maxWidth: X1 - X0 - 108 - v.width }));
      return h;
    },
    rankRow: function (k, c, y, r, height) {
      var h = height || 126;
      var u = h / 126;
      k.rect(X0, y, X1 - X0, h, { fill: c.pal.card, radius: 18 });
      k.rect(X0, y, 120, h, { fill: c.pal.stub, radius: 18 });
      k.line(X0 + 120, y + 8, X0 + 120, y + h - 8, { color: c.pal.bg, width: 5, dash: [10, 10] });
      k.text(String(r.rank), X0 + 60, y + 24 * u, opts(font('StoryAnton', '400', Math.round(70 * u)), { color: c.pal.onStub, align: 'center' }));
      var v = k.text(r.value, X1 - 34, y + 24 * u, opts(inter('800', Math.round(46 * u)), { color: c.pal.fg, align: 'right', maxWidth: 260 }));
      k.text(r.valueSub, X1 - 34, y + 80 * u, opts(inter('600', Math.round(24 * u)), { color: c.pal.muted, align: 'right', maxWidth: 260 }));
      var room = X1 - 34 - Math.max(v.width, 120) - 30 - (X0 + 150);
      k.text(r.title, X0 + 150, y + 22 * u, opts(inter('800', Math.round(44 * u)), { color: c.pal.fg, maxWidth: room, minSize: 30, ellipsis: true }));
      k.text(r.sub, X0 + 150, y + 78 * u, opts(inter('600', Math.round(28 * u)), { color: c.pal.muted, maxWidth: room }));
      return h;
    },
    barRow: function (k, c, y, r, h) {
      var size = Math.round(h * 0.42);
      k.text(String(r.rank), X0, y + (h - size * 1.15) / 2, opts(inter('800', size), { color: c.pal.stamp, maxWidth: 60 }));
      pill(k, r.code, X0 + 64, y + h * 0.18, r.color, r.onColor, { h: Math.round(h * 0.64) });
      var bx = X0 + 240;
      var bw = X1 - 210 - bx;
      var bh = Math.round(h * 0.34);
      k.rect(bx, y + (h - bh) / 2, bw, bh, { fill: c.pal.dots, radius: bh / 2 });
      if (r.fraction > 0) k.rect(bx, y + (h - bh) / 2, Math.max(bh, bw * Math.min(1, r.fraction)), bh, { fill: r.color, radius: bh / 2 });
      var vs = Math.round(h * 0.36);
      k.text(r.lap ? r.value + ' (' + r.lap + ')' : r.value, X1, y + (h - vs * 1.15) / 2, opts(inter('800', vs), { color: c.pal.fg, align: 'right', maxWidth: 196 }));
      return h;
    }
  };

  // ---------- Scoreboard: near-black, condensed numbers, outlined ranks ----------

  var scoreboard = {
    key: 'scoreboard',
    colors: function (c) {
      var p = c.pal;
      return { ink: p.fg, strong: p.accent, soft: p.muted, accent: p.accent, track: p.track, line: p.fg, card: p.track, bg: p.bg };
    },
    background: function (k, c) {
      k.fill(c.pal.bg);
    },
    logos: function (k, c, y) {
      return logos(k, c, y, c.pal.fg);
    },
    kicker: function (k, c, s, x, y, o) {
      return k.text(s, x, y, opts(font('StoryAnton', '400', 52), opts({ color: c.pal.accent, caps: true, spacing: 3, maxWidth: X1 - x, ellipsis: true }, o))).height;
    },
    title: function (k, c, s, x, y, o) {
      return k.wrap(s, x, y, opts(font('StoryAnton', '400', 140), opts({ color: c.pal.fg, caps: true, lineHeight: 1.0, maxWidth: X1 - x, maxLines: 2, minSize: 80, ellipsis: true }, o))).height;
    },
    big: function (k, c, s, x, y, o) {
      return k.text(s, x, y, opts(font('StoryAnton', '400', 240), opts({ color: c.pal.fg, maxWidth: X1 - x, minSize: 120, lineHeight: 1.05 }, o))).height;
    },
    giant: function (k, c, s, x, y, o) {
      return k.text(s, x, y, opts(font('StoryAnton', '400', 520), opts({ color: c.pal.fg, outline: 9, maxWidth: X1 - x, lineHeight: 1.0 }, o))).height;
    },
    body: function (k, c, s, x, y, o) {
      var b = o && o.bold;
      return k.wrap(s, x, y, opts(inter(b ? '800' : '600', 44), opts({ color: o && o.soft ? c.pal.muted : c.pal.fg, maxWidth: X1 - x, maxLines: 2 }, o))).height;
    },
    aside: function (k, c, s, x, y, o) {
      return k.wrap(s, x, y, opts(inter('600', 42), opts({ color: c.pal.muted, maxWidth: X1 - x, maxLines: 2, ellipsis: true }, o))).height;
    },
    note: function (k, c, s) {
      if (s) k.text(s, X0, NOTE_Y, opts(inter('600', 28), { color: c.pal.muted, maxWidth: X1 - X0 }));
    },
    rule: function (k, c, y) {
      k.line(X0, y, X1, y, { color: c.pal.accent, width: 4 });
      return 4;
    },
    badge: function (k, c, lines, cx, cy, o) {
      var s = (o && o.r ? o.r : 140) * 1.6;
      k.rect(cx - s / 2, cy - s / 2, s, s, { stroke: c.pal.accent, lineWidth: 6, radius: 18 });
      k.text(lines[0], cx, cy - s * 0.36, opts(font('StoryAnton', '400', Math.round(s * 0.36)), { color: c.pal.accent, align: 'center', caps: true, maxWidth: s - 30 }));
      k.text(lines[1], cx, cy + s * 0.12, opts(inter('800', Math.round(s * 0.14)), { color: c.pal.fg, align: 'center', caps: true, maxWidth: s - 30 }));
    },
    chip: function (k, c, code, x, y, color, onColor, o) {
      return pill(k, code, x, y, color, onColor, Object.assign({ radius: 10, family: 'StoryAnton' }, o || {}));
    },
    hallName: function (k, c, code, x, y, color) {
      k.text(code, x, y, opts(font('StoryAnton', '400', 300), { color: color, outline: 9, maxWidth: X1 - x, lineHeight: 1.0 }));
      return 300;
    },
    statRow: function (k, c, y, label, value) {
      var h = 108;
      var v = k.text(value, X1, y + 14, opts(font('StoryAnton', '400', 72), { color: c.pal.fg, align: 'right', maxWidth: 420 }));
      k.text(label, X0, y + 34, opts(inter('600', 36), { color: c.pal.muted, maxWidth: X1 - X0 - 30 - v.width }));
      k.line(X0, y + h - 4, X1, y + h - 4, { color: c.pal.track, width: 3 });
      return h;
    },
    rankRow: function (k, c, y, r, height) {
      var h = height || 126;
      var u = h / 126;
      k.text(String(r.rank), X0, y + 14 * u, opts(font('StoryAnton', '400', Math.round(90 * u)), { color: c.pal.accent, outline: 3, maxWidth: 70 }));
      var v = k.text(r.value, X1, y + 16 * u, opts(font('StoryAnton', '400', Math.round(64 * u)), { color: c.pal.fg, align: 'right', maxWidth: 280 }));
      k.text(r.valueSub, X1, y + 92 * u, opts(inter('600', Math.round(22 * u)), { color: c.pal.muted, align: 'right', caps: true, spacing: 2, maxWidth: 280 }));
      var room = X1 - Math.max(v.width, 120) - 30 - (X0 + 100);
      k.text(r.title, X0 + 100, y + 20 * u, opts(inter('800', Math.round(44 * u)), { color: c.pal.fg, maxWidth: room, minSize: 30, ellipsis: true }));
      k.text(r.sub, X0 + 100, y + 76 * u, opts(inter('800', Math.round(30 * u)), { color: r.color, maxWidth: room }));
      return h;
    },
    barRow: function (k, c, y, r, h) {
      var size = Math.round(h * 0.7);
      k.text(String(r.rank), X0, y + (h - size) / 2, opts(font('StoryAnton', '400', size), { color: c.pal.accent, outline: 3, maxWidth: 56, lineHeight: 1.0 }));
      k.text(r.code, X0 + 70, y + (h - size) / 2, opts(font('StoryAnton', '400', size), { color: c.pal.fg, maxWidth: 150, lineHeight: 1.0 }));
      var bx = X0 + 240;
      var bw = X1 - 210 - bx;
      var bh = Math.round(h * 0.42);
      k.rect(bx, y + (h - bh) / 2, bw, bh, { fill: c.pal.track, radius: 8 });
      if (r.fraction > 0) k.rect(bx, y + (h - bh) / 2, Math.max(8, bw * Math.min(1, r.fraction)), bh, { fill: r.color, radius: 8 });
      var vs = Math.round(h * 0.36);
      k.text(r.lap ? r.value + ' (' + r.lap + ')' : r.value, X1, y + (h - vs * 1.15) / 2, opts(inter('600', vs), { color: c.pal.fg, align: 'right', maxWidth: 196 }));
      return h;
    }
  };

  // ---------- Big fact: a full colour per story, heavy type, tags ----------

  function soft(c) {
    var s = c.surface;
    return mix(s.fg, s.bg, 0.22);
  }

  var bigfact = {
    key: 'bigfact',
    colors: function (c) {
      var s = c.surface;
      return { ink: s.fg, strong: s.big, soft: soft(c), accent: s.big, track: mix(s.bg, s.fg, 0.25), line: s.fg, card: mix(s.bg, s.fg, 0.12), bg: s.bg };
    },
    background: function (k, c) {
      k.fill(c.surface.bg);
    },
    logos: function (k, c, y) {
      return logos(k, c, y, c.surface.fg);
    },
    kicker: function (k, c, s, x, y, o) {
      return k.text(s, x, y, opts(inter('800', 34), opts({ color: c.surface.fg, caps: true, spacing: 7, maxWidth: X1 - x, ellipsis: true }, o))).height;
    },
    title: function (k, c, s, x, y, o) {
      return k.wrap(s, x, y, opts(font('StoryArchivo', '400', 112), opts({ color: c.surface.fg, lineHeight: 1.04, maxWidth: X1 - x, maxLines: 3, minSize: 64, ellipsis: true }, o))).height;
    },
    big: function (k, c, s, x, y, o) {
      return k.text(s, x, y, opts(font('StoryArchivo', '400', 196), opts({ color: c.surface.big, maxWidth: X1 - x, minSize: 100, lineHeight: 1.1 }, o))).height;
    },
    giant: function (k, c, s, x, y, o) {
      return k.text(s, x, y, opts(font('StoryArchivo', '400', 460), opts({ color: c.surface.big, maxWidth: X1 - x, lineHeight: 1.0 }, o))).height;
    },
    body: function (k, c, s, x, y, o) {
      var b = !(o && o.light);
      return k.wrap(s, x, y, opts(inter(b ? '800' : '600', 48), opts({ color: o && o.soft ? soft(c) : c.surface.fg, maxWidth: X1 - x, maxLines: 2 }, o))).height;
    },
    aside: function (k, c, s, x, y, o) {
      return k.wrap(s, x, y, opts(inter('600', 44), opts({ color: c.surface.fg, maxWidth: X1 - x, maxLines: 2, ellipsis: true }, o))).height;
    },
    note: function (k, c, s) {
      if (s) k.text(s, X0, NOTE_Y, opts(inter('600', 28), { color: soft(c), maxWidth: X1 - X0 }));
    },
    rule: function () {
      return 0;
    },
    badge: function (k, c, lines, x, cy) {
      var top = inter('800', 58);
      var bottom = inter('800', 34);
      var w = Math.max(k.measure(lines[0], opts(top, { caps: true })), k.measure(lines[1], opts(bottom, { caps: true }))) + 64;
      var cx = Math.min(x, X1 - w / 2 - 24);
      k.rotated(cx, cy, 6, function () {
        k.rect(cx - w / 2, cy - 72, w, 144, { fill: c.surface.fg, radius: 14 });
        k.text(lines[0], cx, cy - 52, opts(top, { color: c.surface.bg, align: 'center', caps: true }));
        k.text(lines[1], cx, cy + 16, opts(bottom, { color: c.surface.bg, align: 'center', caps: true }));
      });
    },
    chip: function (k, c, code, x, y, color, onColor, o) {
      return pill(k, code, x, y, color, onColor, o || {});
    },
    hallName: function (k, c, code, x, y, color) {
      k.text(code, x, y, opts(font('StoryArchivo', '400', 300), { color: c.surface.fg, maxWidth: X1 - x, lineHeight: 1.0 }));
      if (color !== c.surface.bg) k.rect(x + 8, y + 296, 220, 16, { fill: color, radius: 8 });
      return 316;
    },
    statRow: function (k, c, y, label, value) {
      var h = 112;
      k.rect(X0, y, X1 - X0, h, { fill: mix(c.surface.bg, c.surface.fg, 0.12), radius: 18 });
      var v = k.text(value, X1 - 34, y + 26, opts(font('StoryArchivo', '400', 54), { color: c.surface.fg, align: 'right', maxWidth: 400 }));
      k.text(label, X0 + 34, y + 33, opts(inter('600', 40), { color: c.surface.fg, maxWidth: X1 - X0 - 100 - v.width }));
      return h;
    },
    rankRow: function (k, c, y, r, height) {
      var h = height || 126;
      var u = h / 126;
      k.rect(X0, y, X1 - X0, h, { fill: mix(c.surface.bg, c.surface.fg, 0.12), radius: 18 });
      k.text(String(r.rank), X0 + 30, y + 24 * u, opts(font('StoryArchivo', '400', Math.round(66 * u)), { color: c.surface.fg, maxWidth: 70 }));
      var v = k.text(r.value, X1 - 30, y + 26 * u, opts(font('StoryArchivo', '400', Math.round(48 * u)), { color: c.surface.fg, align: 'right', maxWidth: 280 }));
      k.text(r.valueSub, X1 - 30, y + 84 * u, opts(inter('600', Math.round(24 * u)), { color: soft(c), align: 'right', maxWidth: 280 }));
      var room = X1 - 30 - Math.max(v.width, 120) - 30 - (X0 + 120);
      k.text(r.title, X0 + 120, y + 22 * u, opts(inter('800', Math.round(44 * u)), { color: c.surface.fg, maxWidth: room, minSize: 30, ellipsis: true }));
      pill(k, r.sub, X0 + 120, y + 76 * u, r.color, r.onColor, { h: Math.round(36 * u) });
      return h;
    },
    barRow: function (k, c, y, r, h) {
      var size = Math.round(h * 0.5);
      k.text(String(r.rank), X0, y + (h - size * 1.15) / 2, opts(font('StoryArchivo', '400', size), { color: c.surface.fg, maxWidth: 60 }));
      pill(k, r.code, X0 + 64, y + h * 0.18, r.color, r.onColor, { h: Math.round(h * 0.64) });
      var bx = X0 + 240;
      var bw = X1 - 210 - bx;
      var bh = Math.round(h * 0.36);
      k.rect(bx, y + (h - bh) / 2, bw, bh, { fill: mix(c.surface.bg, c.surface.fg, 0.22), radius: bh / 2 });
      if (r.fraction > 0) k.rect(bx, y + (h - bh) / 2, Math.max(bh, bw * Math.min(1, r.fraction)), bh, { fill: c.surface.fg, radius: bh / 2 });
      var vs = Math.round(h * 0.36);
      k.text(r.lap ? r.value + ' (' + r.lap + ')' : r.value, X1, y + (h - vs * 1.15) / 2, opts(inter('800', vs), { color: c.surface.fg, align: 'right', maxWidth: 196 }));
      return h;
    }
  };

  window.GLCStoryLooks = { journal: journal, scoreboard: scoreboard, bigfact: bigfact, X0: X0, X1: X1, NOTE_Y: NOTE_Y };
})();
