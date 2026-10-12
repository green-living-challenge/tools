/* GLC tools: the story maker's canvas kit. Loads the fonts, and draws text that fits, shapes and
   the logos on a 1080 x 1920 canvas, keeping a record of every box drawn so the checks can find
   text that overflows or enters Instagram's bars. Browser only: window.GLCStoryKit, loaded after
   hub-logos.js. Spec: docs/superpowers/specs/2026-10-12-story-maker-design.md, sections 2 and 4. */
(function () {
  'use strict';

  var W = 1080;
  var H = 1920;
  // The content area: Instagram draws its own bars above 250 px and below 1640 px.
  var SAFE = { left: 80, right: 1000, top: 250, bottom: 1640 };
  var FONTS = [
    { family: 'StoryHand', url: 'vendor/gochi-hand-latin.woff2', weight: '400' },
    { family: 'StoryAnton', url: 'fonts/anton-latin-400.woff2', weight: '400' },
    { family: 'StoryArchivo', url: 'fonts/archivo-black-latin-400.woff2', weight: '400' },
    { family: 'StoryInter', url: 'fonts/inter-latin-600.woff2', weight: '600' },
    { family: 'StoryInter', url: 'fonts/inter-latin-800.woff2', weight: '800' }
  ];

  var loading = null;

  // Loads the five font files once. Resolves true when every one is ready, false when one fails
  // or the time runs out (the next call tries again).
  function loadFonts(timeoutMs) {
    if (loading) return loading;
    if (typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve(false);
    var timer;
    var all = Promise.all(FONTS.map(function (f) {
      return new FontFace(f.family, 'url(' + f.url + ')', { weight: f.weight, style: 'normal' }).load().then(function (face) {
        document.fonts.add(face);
      });
    })).then(function () { return true; });
    var limit = new Promise(function (resolve) {
      timer = setTimeout(function () { resolve(false); }, timeoutMs || 15000);
    });
    loading = Promise.race([all, limit]).catch(function () { return false; }).then(function (ok) {
      clearTimeout(timer);
      if (!ok) loading = null;
      return ok;
    });
    return loading;
  }

  // A drawing session on one canvas. Every draw call adds a box to session.boxes:
  // { kind: 'text' | 'shape' | 'background', x, y, w, h, overflow, what }.
  function session(canvas) {
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var boxes = [];
    var turn = null;

    function font(o) {
      return (o.weight || '600') + ' ' + o.size + 'px "' + (o.family || 'StoryInter') + '"';
    }

    // A box in canvas coordinates, through the current rotation when there is one.
    function record(kind, x, y, w, h, extra) {
      var box = { kind: kind, x: x, y: y, w: w, h: h };
      if (turn) {
        var pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(function (p) {
          var dx = p[0] - turn.cx;
          var dy = p[1] - turn.cy;
          return [turn.cx + dx * turn.cos - dy * turn.sin, turn.cy + dx * turn.sin + dy * turn.cos];
        });
        var xs = pts.map(function (p) { return p[0]; });
        var ys = pts.map(function (p) { return p[1]; });
        box = { kind: kind, x: Math.min.apply(null, xs), y: Math.min.apply(null, ys), w: Math.max.apply(null, xs) - Math.min.apply(null, xs), h: Math.max.apply(null, ys) - Math.min.apply(null, ys) };
      }
      boxes.push(Object.assign(box, extra || {}));
    }

    // Width of one line, with extra space between letters when spacing is set.
    function measure(s, o) {
      ctx.font = font(o);
      var w = ctx.measureText(s).width;
      return o.spacing ? w + o.spacing * Math.max(0, s.length - 1) : w;
    }

    function paint(s, x, y, o) {
      ctx.font = font(o);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      var draw = function (str, px) {
        if (o.outline) {
          ctx.lineWidth = o.outline;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = o.color;
          ctx.strokeText(str, px, y);
        } else {
          ctx.fillStyle = o.color;
          ctx.fillText(str, px, y);
        }
      };
      if (!o.spacing) return draw(s, x);
      var px = x;
      for (var i = 0; i < s.length; i++) {
        draw(s.charAt(i), px);
        px += ctx.measureText(s.charAt(i)).width + o.spacing;
      }
    }

    function startX(x, width, align) {
      if (align === 'center') return x - width / 2;
      if (align === 'right') return x - width;
      return x;
    }

    // One line at (x, y), y being the top. o: { family, weight, size, color, align, maxWidth,
    // minSize, spacing, caps, outline, lineHeight, ellipsis }. A line wider than maxWidth is drawn
    // smaller, down to minSize (default 60 percent). If it still does not fit, ellipsis cuts it
    // short with '...' at the end; otherwise the box is marked overflow. Returns { width, height, size }.
    function text(str, x, y, opts) {
      var o = Object.assign({ size: 40, color: '#000000', lineHeight: 1.15 }, opts);
      var s = o.caps ? String(str).toUpperCase() : String(str);
      var w = measure(s, o);
      if (o.maxWidth && w > o.maxWidth) {
        var min = o.minSize || Math.round(o.size * 0.6);
        o.size = Math.max(min, Math.floor(o.size * o.maxWidth / w));
        w = measure(s, o);
      }
      if (o.ellipsis && o.maxWidth && w > o.maxWidth) {
        while (s.length > 1 && w > o.maxWidth) {
          s = s.slice(0, -1);
          w = measure(s.replace(/\s+$/, '') + '...', o);
        }
        s = s.replace(/\s+$/, '') + '...';
      }
      var overflow = !!(o.maxWidth && w > o.maxWidth + 0.5);
      var left = startX(x, w, o.align);
      paint(s, left, y, o);
      var h = o.size * o.lineHeight;
      record('text', left, y, w, h, { overflow: overflow, what: s });
      return { width: w, height: h, size: o.size };
    }

    function breakLines(s, o) {
      var lines = [];
      String(s).split('\n').forEach(function (para) {
        var words = para.split(/\s+/).filter(Boolean);
        var line = '';
        words.forEach(function (word) {
          var tryLine = line ? line + ' ' + word : word;
          if (line && measure(tryLine, o) > o.maxWidth) {
            lines.push(line);
            line = word;
          } else {
            line = tryLine;
          }
        });
        if (line) lines.push(line);
      });
      return lines;
    }

    // A line cut short with '...' at the end so it fits maxWidth.
    function cutToFit(line, o) {
      var s = line;
      while (s.length > 1 && measure(s.replace(/\s+$/, '') + '...', o) > o.maxWidth) s = s.slice(0, -1);
      return s.replace(/\s+$/, '') + '...';
    }

    // Wrapped text from (x, y). o as text() plus maxWidth (required), maxLines and lineHeight.
    // The size steps down until the text fits in maxLines lines. At minSize, with ellipsis, the
    // text is cut to maxLines lines ending in '...'; without it, whatever is left is drawn and
    // marked overflow. Returns { width, height, size, lines }.
    function wrap(str, x, y, opts) {
      var o = Object.assign({ size: 40, color: '#000000', lineHeight: 1.2, maxLines: 3 }, opts);
      var s = o.caps ? String(str).toUpperCase() : String(str);
      var min = o.minSize || Math.round(o.size * 0.6);
      var lines = breakLines(s, o);
      while (o.size > min && (lines.length > o.maxLines || lines.some(function (l) { return measure(l, o) > o.maxWidth; }))) {
        o.size = Math.max(min, o.size - 2);
        lines = breakLines(s, o);
      }
      if (o.ellipsis) {
        var cut = lines.length > o.maxLines;
        lines = lines.slice(0, o.maxLines).map(function (l, i, all) {
          return measure(l, o) > o.maxWidth || (cut && i === all.length - 1) ? cutToFit(l, o) : l;
        });
      }
      var widest = 0;
      lines.forEach(function (l, i) {
        var w = measure(l, o);
        widest = Math.max(widest, w);
        var left = startX(x, w, o.align);
        paint(l, left, y + i * o.size * o.lineHeight, o);
        record('text', left, y + i * o.size * o.lineHeight, w, o.size * o.lineHeight, { overflow: w > o.maxWidth + 0.5 || i >= o.maxLines, what: l });
      });
      return { width: widest, height: lines.length * o.size * o.lineHeight, size: o.size, lines: lines.length };
    }

    function roundRect(x, y, w, h, r) {
      var rr = Math.max(0, Math.min(r || 0, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    // A rectangle. o: { fill, stroke, lineWidth, radius, dash, alpha, background }.
    function rect(x, y, w, h, opts) {
      var o = opts || {};
      ctx.save();
      if (typeof o.alpha === 'number') ctx.globalAlpha = o.alpha;
      roundRect(x, y, w, h, o.radius);
      if (o.fill) {
        ctx.fillStyle = o.fill;
        ctx.fill();
      }
      if (o.stroke) {
        ctx.lineWidth = o.lineWidth || 4;
        ctx.strokeStyle = o.stroke;
        ctx.setLineDash(o.dash || []);
        ctx.stroke();
      }
      ctx.restore();
      record(o.background ? 'background' : 'shape', x, y, w, h);
    }

    function circle(cx, cy, r, opts) {
      var o = opts || {};
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (o.fill) {
        ctx.fillStyle = o.fill;
        ctx.fill();
      }
      if (o.stroke) {
        ctx.lineWidth = o.lineWidth || 4;
        ctx.strokeStyle = o.stroke;
        ctx.stroke();
      }
      ctx.restore();
      var edge = r + (o.stroke ? (o.lineWidth || 4) / 2 : 0);
      record('shape', cx - edge, cy - edge, 2 * edge, 2 * edge);
    }

    // o: { color, width, dash, cap }.
    function line(x1, y1, x2, y2, opts) {
      var o = opts || {};
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = o.width || 4;
      ctx.strokeStyle = o.color || '#000000';
      ctx.lineCap = o.cap || 'butt';
      ctx.setLineDash(o.dash || []);
      ctx.stroke();
      ctx.restore();
      // The stroke's width counts across the line; along it only a round cap adds to it.
      var half = (o.width || 4) / 2;
      var cap = o.cap === 'round' ? half : 0;
      var px = y1 === y2 ? cap : half;
      var py = x1 === x2 ? cap : half;
      record('shape', Math.min(x1, x2) - px, Math.min(y1, y2) - py, Math.abs(x2 - x1) + 2 * px, Math.abs(y2 - y1) + 2 * py);
    }

    // A downward arrow from (cx, y), length long.
    function arrow(cx, y, length, color, width) {
      var w = width || 10;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx, y + length);
      ctx.moveTo(cx - 30, y + length - 34);
      ctx.lineTo(cx, y + length);
      ctx.lineTo(cx + 30, y + length - 34);
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
      record('shape', cx - 30 - w / 2, y - w / 2, 60 + w, length + w);
    }

    function fill(color) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
      record('background', 0, 0, W, H);
    }

    // A grid of dots over the whole frame.
    function dots(color, gap, radius) {
      ctx.save();
      ctx.fillStyle = color;
      for (var y = gap / 2; y < H; y += gap) {
        for (var x = gap / 2; x < W; x += gap) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      record('background', 0, 0, W, H);
    }

    // A logo from hub-logos.js, height tall, its top left at (x, y). The SRL mark's white
    // separator lines take hole, the colour behind the logo. Returns the width drawn.
    function logo(key, x, y, height, color, hole) {
      var data = window.GLCLogos && window.GLCLogos[key];
      if (!data) return 0;
      var vb = String(data.viewBox).split(/\s+/).map(Number);
      var s = height / vb[3];
      ctx.save();
      ctx.translate(x - vb[0] * s, y - vb[1] * s);
      ctx.scale(s, s);
      data.paths.forEach(function (p) {
        var own = p.fill === 'currentColor';
        if (!own && !hole) return;
        ctx.fillStyle = own ? color : hole;
        ctx.fill(new Path2D(p.d));
      });
      ctx.restore();
      record('shape', x, y, vb[2] * s, height);
      return vb[2] * s;
    }

    function logoWidth(key, height) {
      var data = window.GLCLogos && window.GLCLogos[key];
      if (!data) return 0;
      var vb = String(data.viewBox).split(/\s+/).map(Number);
      return vb[2] * height / vb[3];
    }

    // Draws fn turned by deg around (cx, cy). Boxes recorded inside are turned too.
    function rotated(cx, cy, deg, fn) {
      var a = deg * Math.PI / 180;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.translate(-cx, -cy);
      var before = turn;
      turn = { cx: cx, cy: cy, cos: Math.cos(a), sin: Math.sin(a) };
      try {
        fn();
      } finally {
        turn = before;
        ctx.restore();
      }
    }

    // What the checks complain about: text marked overflow, and text or shapes outside the
    // content area. [] when the story is clean.
    function problems() {
      var out = [];
      boxes.forEach(function (b) {
        if (b.kind === 'background') return;
        var where = b.what ? '"' + b.what + '"' : b.kind + ' at ' + Math.round(b.x) + ',' + Math.round(b.y);
        if (b.overflow) out.push(where + ' does not fit its width');
        if (b.x < SAFE.left - 1 || b.x + b.w > SAFE.right + 1 || b.y < SAFE.top - 1 || b.y + b.h > SAFE.bottom + 1) {
          out.push(where + ' is outside the content area (' + Math.round(b.x) + ',' + Math.round(b.y) + ' to ' + Math.round(b.x + b.w) + ',' + Math.round(b.y + b.h) + ')');
        }
      });
      return out;
    }

    return {
      ctx: ctx,
      W: W,
      H: H,
      SAFE: SAFE,
      boxes: boxes,
      measure: function (s, o) { return measure(o && o.caps ? String(s).toUpperCase() : String(s), Object.assign({ size: 40 }, o)); },
      text: text,
      wrap: wrap,
      rect: rect,
      circle: circle,
      line: line,
      arrow: arrow,
      fill: fill,
      dots: dots,
      logo: logo,
      logoWidth: logoWidth,
      rotated: rotated,
      problems: problems
    };
  }

  // The canvas as a PNG blob.
  function toBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { return b ? resolve(b) : reject(new Error('The image could not be made.')); }, 'image/png');
    });
  }

  window.GLCStoryKit = { W: W, H: H, SAFE: SAFE, FONTS: FONTS, loadFonts: loadFonts, session: session, toBlob: toBlob };
})();
