/* GLC tools: the story maker's WhatsApp tab. Today's two messages as WhatsApp bubbles with the
   picture of the day, the evening reminder and the poll, with Share with picture, Copy text and
   Open in WhatsApp. The messages come from wa-plan.js; story-app.js draws the picture and passes
   it in. Browser only: window.GLCWhatsAppPanel, loaded after wa-plan.js and before story-app.js.
   Spec: docs/superpowers/specs/2026-10-13-whatsapp-messages-design.md, sections 1 and 4. */
(function () {
  'use strict';

  if (!window.React || !window.htm || !window.GLCStory || !window.GLCWhatsApp) return;

  var html = htm.bind(React.createElement);
  var S = window.GLCStory;
  var W = window.GLCWhatsApp;
  var COPIED = 'Text copied.';
  var COPIED_SHARE = 'Text copied. In WhatsApp, paste it as the caption.';
  var COPIED_DOWNLOADED = 'Text copied. The picture was downloaded: attach it in WhatsApp and paste the text as its caption.';
  var COPY_THEN_SHARE = 'Copying did not work. Use Copy text, then Share picture.';
  var COPY_FAILED = 'Copying did not work in this browser. Select the text and copy it by hand.';
  var SHARE_FAILED = 'Sharing did not work here. Use Download instead.';
  var MAY_NOT_FIT = 'Part of this picture may not fit. Pick the other card, or Shuffle.';
  var IMAGE_FAILED = 'The picture could not be made on this device. Copy text and Open in WhatsApp still work.';

  // Copies text to the clipboard, started straight from the tap: a promise of true or false.
  function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
      }
    } catch (e) {
      // A browser that throws instead of refusing: the same as refused.
    }
    return Promise.resolve(false);
  }

  // A message as WhatsApp shows it: the picture on top when there is one, then the text.
  function Bubble(props) {
    return html`
      <div className="bubble">
        ${props.image ? html`<img src=${props.image.url} alt="The picture of the day" width="1080" height="1350" />` : null}
        <div className="bubble-text">
          ${W.previewParts(props.text).map(function (line, i) {
            return html`<div key=${i} className=${line.length ? 'line' : 'line blank'}>${line.map(function (p, j) {
              if (p.bold) return html`<b key=${j}>${p.text}</b>`;
              if (p.italic) return html`<i key=${j}>${p.text}</i>`;
              if (p.link) return html`<span key=${j} className="wa-link">${p.text}</span>`;
              return html`<span key=${j}>${p.text}</span>`;
            })}</div>`;
          })}
        </div>
      </div>`;
  }

  // props: { facts, plan, day, updateDay, names, link, picture, image, imageFailed, canShare,
  // shareFiles, downloadFile, setMessage }. picture: wa-plan's pictureOfDay; image: its PNG
  // ({ url, file, problems }), null while it is drawn or when it could not be made (imageFailed).
  function WhatsAppPanel(p) {
    var f = p.facts;
    var plan = p.plan;
    if (!f || !plan) return null;
    if (plan.state === 'before') {
      return html`<p className="empty">Messages begin on ${S.longDay(f.startDate)}, the first day of the challenge.</p>`;
    }
    var m = W.messages(f, plan, { names: p.names, link: p.link });
    var img = p.image;
    var canShare = !!(img && p.canShare);
    var pic = p.picture;

    function sharePicture() {
      p.shareFiles([img.file]).then(function (result) {
        if (result === 'unsupported') p.downloadFile(img.file);
        else if (result === 'failed') p.setMessage(SHARE_FAILED);
      });
    }

    // The text to the clipboard, then the picture to the share sheet, in one tap: iPhones drop
    // one of the two when both go to the share sheet.
    function shareWithPicture(text) {
      var copied = copy(text);
      p.shareFiles([img.file]).then(function (result) {
        if (result === 'unsupported') p.downloadFile(img.file);
        return copied.then(function (done) {
          if (!done) p.setMessage(COPY_THEN_SHARE);
          else if (result === 'unsupported') p.setMessage(COPIED_DOWNLOADED);
          else if (result === 'failed') p.setMessage(SHARE_FAILED);
          else p.setMessage(COPIED_SHARE);
        });
      });
    }

    function copyOnly(text) {
      copy(text).then(function (done) { p.setMessage(done ? COPIED : COPY_FAILED); });
    }

    function actions(text, withPicture) {
      return html`
        <div className="row wrap">
          ${withPicture ? html`<button type="button" className="primary" disabled=${!text || !canShare} onClick=${function () { shareWithPicture(text); }}>Share with picture</button>` : null}
          <button type="button" disabled=${!text} onClick=${function () { copyOnly(text); }}>Copy text</button>
          ${text
            ? html`<a className="button" href=${W.waLink(text)} target="_blank" rel="noopener noreferrer">Open in WhatsApp</a>`
            : html`<span className="button disabled" aria-disabled="true">Open in WhatsApp</span>`}
        </div>`;
    }

    function version(title, text) {
      return html`
        <section className="wa-version" aria-label=${title}>
          <h3>${title}</h3>
          <div className="chat">
            ${text ? html`<${Bubble} image=${img} text=${text} />` : html`<div className="placeholder wide">Loading the numbers...</div>`}
          </div>
          <p className="count">${text ? W.charCount(text) + ' characters' : ''}</p>
          ${actions(text, true)}
        </section>`;
    }

    var pickMark = function (which) { return pic && pic.auto === which ? ' (today’s pick)' : ''; };
    return html`
      <div className="wa">
        <section className="wa-picture" aria-labelledby="wa-picture-title">
          <h2 id="wa-picture-title">Picture of the day</h2>
          ${img
            ? html`<img className="card-img" src=${img.url} alt="The picture of the day" width="1080" height="1350" />`
            : html`<div className="placeholder card">${p.imageFailed ? IMAGE_FAILED : 'Drawing...'}</div>`}
          ${img && img.problems.length ? html`<p className="warn">${MAY_NOT_FIT}</p>` : null}
          <label className="field">
            <span>Picture</span>
            <select name="picture" value=${pic ? pic.chosen : 'day'} disabled=${!pic} onChange=${function (e) { p.updateDay(S.setCard(p.day, e.target.value)); }}>
              <option value="day">Day card${pickMark('day')}</option>
              <option value="standings" disabled=${!S.available(f).standings}>Standings card${pickMark('standings')}</option>
            </select>
          </label>
          <div className="row">
            <button type="button" disabled=${!canShare} onClick=${sharePicture}>Share picture</button>
            <button type="button" disabled=${!canShare} onClick=${function () { p.downloadFile(img.file); }}>Download</button>
          </div>
        </section>
        <div className="wa-versions">
          ${version('Version A: quick', m ? m.a : '')}
          ${version('Version B: standings', m ? m.b : '')}
        </div>
        ${m && m.reminder ? html`
          <section className="wa-extra" aria-labelledby="wa-reminder-title">
            <h2 id="wa-reminder-title">Evening reminder</h2>
            <div className="chat"><${Bubble} text=${m.reminder} /></div>
            ${actions(m.reminder, false)}
          </section>` : null}
        ${m && m.poll ? html`
          <section className="wa-extra" aria-labelledby="wa-poll-title">
            <h2 id="wa-poll-title">Poll</h2>
            <p>Post a WhatsApp poll: tap +, then Poll.</p>
            <p className="row"><span>${m.poll.question}</span><button type="button" onClick=${function () { copyOnly(m.poll.question); }}>Copy</button></p>
            ${m.poll.options.map(function (o) { return html`<p key=${o} className="row"><span>${o}</span><button type="button" onClick=${function () { copyOnly(o); }}>Copy</button></p>`; })}
          </section>` : null}
        <section className="helpers" aria-labelledby="wa-help-title">
          <h2 id="wa-help-title">How to post</h2>
          <ol>
            <li>Share with picture copies the text and opens the share sheet with the picture.</li>
            <li>In WhatsApp, pick the GLC community's announcements, paste the text as the caption and send.</li>
            <li>For text only, use Open in WhatsApp, or Copy text and paste it.</li>
          </ol>
        </section>
      </div>`;
  }

  window.GLCWhatsAppPanel = WhatsAppPanel;
})();
