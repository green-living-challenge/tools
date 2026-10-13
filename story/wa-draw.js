/* GLC tools: the WhatsApp cards (1080 x 1350), the day card and the standings card. Each places the
   parts of a card's content (wa-plan.js cardContent) through the day's look (story-looks.js) on a
   kit session in the card frame (story-kit.js). Browser only: window.GLCWhatsAppDraw.
   Spec: docs/superpowers/specs/2026-10-13-whatsapp-messages-design.md, section 3. */
(function () {
  'use strict';

  var Kit = window.GLCStoryKit;
  var Looks = window.GLCStoryLooks;
  var X0 = 80;
  var X1 = 1000;
  var CW = X1 - X0;
  var FOOT_Y = Kit.FRAMES.card.h - 100;

  // A size for each look: Journal, Scoreboard, Big fact.
  function bySkin(c, journal, scoreboard, bigfact) {
    return c.look === 'scoreboard' ? scoreboard : c.look === 'bigfact' ? bigfact : journal;
  }

  // The last line: the time of the numbers and where to find them.
  function foot(k, s, c) {
    if (c.foot) k.text(c.foot, X0, FOOT_Y, { family: 'StoryInter', weight: '600', size: 28, color: s.colors(c).soft, maxWidth: CW, ellipsis: true });
  }

  // Hall chips in a row from X0, with 'vs' between two when asked. Returns the x after the last.
  function chipRow(k, s, c, list, vs, y, h) {
    var x = X0;
    list.forEach(function (ch, i) {
      if (i && vs) {
        k.text('vs', x + 24, y + h * 0.18, { family: 'StoryInter', weight: '800', size: 40, color: s.colors(c).soft });
        x += 100;
      } else if (i) {
        x += 24;
      }
      x += s.chip(k, c, ch.code, x, y, ch.color, ch.onColor, { h: h });
    });
    return x;
  }

  // The lower half of the day card: a label, then rows (a week), or a question, hall chips, a
  // number and short lines (a fact, the stretch, the finish).
  function panel(k, s, c, p, y) {
    y += s.kicker(k, c, p.label, X0, y) + 22;
    if (p.rows) {
      p.rows.forEach(function (r) { y += s.statRow(k, c, y, r.label, r.value) + 12; });
      return;
    }
    if (p.question) y += s.body(k, c, p.question, X0, y, { size: 46, bold: true, maxLines: 2, ellipsis: true }) + 18;
    if (p.chips && p.chips.length) {
      var right = chipRow(k, s, c, p.chips, p.vs, y, 76);
      if (p.chipNote) s.body(k, c, p.chipNote, right + 24, y + 16, { size: 34, soft: true, maxLines: 1, ellipsis: true });
      y += 76 + 22;
    }
    if (p.big) {
      var f = bySkin(c, { family: 'StoryInter', weight: '800' }, { family: 'StoryAnton', weight: '400' }, { family: 'StoryArchivo', weight: '400' });
      var b = k.text(p.big, X0, y, Object.assign(f, { size: bySkin(c, 96, 110, 96), color: s.colors(c).strong, maxWidth: 520 }));
      s.body(k, c, p.bigLabel, X0 + b.width + 24, y + b.height * 0.42, { size: 38, maxLines: 1, ellipsis: true });
      y += b.height + 10;
    }
    (p.lines || []).forEach(function (line) {
      y += s.body(k, c, line, X0, y, { size: 34, soft: true, maxLines: 2, light: true, ellipsis: true }) + 6;
    });
  }

  function dayCard(k, s, c) {
    var y = 70;
    y += s.logos(k, c, y) + 46;
    y += s.kicker(k, c, c.kicker, X0, y) + 14;
    var t = s.title(k, c, c.headline, X0, y, { maxWidth: 600, maxLines: 2, size: bySkin(c, 130, 120, 96) });
    s.badge(k, c, c.badge, 880, y + 95, { r: 100 });
    y += Math.max(t, 200) + 24;
    y += s.big(k, c, c.total, X0, y, { size: bySkin(c, 150, 170, 150) }) + 2;
    y += s.body(k, c, c.totalLine, X0, y, { size: 40, maxLines: 1, ellipsis: true }) + 34;
    if (c.panel) {
      y += s.rule(k, c, y) + 34;
      panel(k, s, c, c.panel, y);
    }
    foot(k, s, c);
  }

  function standingsCard(k, s, c) {
    var y = 80;
    y += s.kicker(k, c, c.kicker, X0, y) + 14;
    y += s.title(k, c, c.headline, X0, y, { maxWidth: CW, maxLines: 1, size: bySkin(c, 120, 110, 92) }) + 26;
    var two = c.groups.length > 1;
    var rows = c.groups.reduce(function (n, g) { return n + g.rows.length; }, 0);
    var extra = c.groups.length * ((two ? 60 : 0) + 18) + c.groups.filter(function (g) { return g.more; }).length * 44 + (c.walkers ? 96 : 0);
    var h = Math.max(54, Math.min(84, Math.floor((FOOT_Y - 24 - y - extra) / Math.max(1, rows)) - 10));
    c.groups.forEach(function (g) {
      if (two) y += s.kicker(k, c, g.label, X0, y) + 14;
      g.rows.forEach(function (r) { y += s.barRow(k, c, y, r, h) + 10; });
      if (g.more) y += s.body(k, c, g.more, X0, y, { size: 30, soft: true, maxLines: 1 }) + 6;
      y += 18;
    });
    if (c.walkers) s.body(k, c, c.walkers, X0, y, { size: 34, maxLines: 2, ellipsis: true });
    foot(k, s, c);
  }

  // Draws one card's content on canvas. Returns the kit's problems ([] when clean).
  function draw(canvas, card) {
    var k = Kit.session(canvas, Kit.FRAMES.card);
    var s = Looks[card.look] || Looks.journal;
    s.background(k, card);
    if (card.card === 'standings') standingsCard(k, s, card);
    else dayCard(k, s, card);
    return k.problems();
  }

  window.GLCWhatsAppDraw = { draw: draw };
})();
