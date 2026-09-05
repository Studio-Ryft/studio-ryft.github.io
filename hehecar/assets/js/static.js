/* HEHE CAR – versione statica su GitHub Pages.
   Legge data/regole.json, aggiorna i contenuti dinamici della pagina, calcola il preventivo nel browser (pricing.js)
   e invia la richiesta di prenotazione via WhatsApp o email all'operatore. Nessun server. */
(function () {
  'use strict';
  var BASE = window.HC_BASE || '';
  var RULES_URL = BASE + '/data/regole.json?t=' + Math.floor(Date.now() / 60000);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
  function money(v, dec) { return Number(v).toLocaleString('it-IT', { minimumFractionDigits: dec == null ? 2 : dec, maximumFractionDigits: 2 }) + ' €'; }
  function fmt(v, dec) { return HCPricing.fmt(v, dec); }
  function itDate(ymd) { var d = new Date(ymd + 'T00:00:00'); return isNaN(d) ? ymd : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function active(list) { return (list || []).filter(function (x) { return Number(x.active) === 1; }); }
  function byOrder(a, b) { return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || Number(a.id) - Number(b.id); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function telHref(p) { return 'tel:' + String(p || '').replace(/\s+/g, ''); }
  var GG = { 1: 'lun', 2: 'mar', 3: 'mer', 4: 'gio', 5: 'ven', 6: 'sab', 7: 'dom' };

  // ------------------------------------------------------------------ idratazione contenuti
  function hydrate(R) {
    var S = R.settings || {};
    $all('[data-hydrate="phone"]').forEach(function (a) { a.textContent = S.phone; a.href = telHref(S.phone); });
    $all('[data-hydrate="phone-cta"]').forEach(function (a) { a.textContent = 'Preferisci telefonare? ' + S.phone; a.href = telHref(S.phone); });
    $all('[data-hydrate="whatsapp"]').forEach(function (a) { a.href = 'https://wa.me/' + String(S.whatsapp || '').replace(/\D/g, ''); });
    $all('[data-hydrate="whatsapp-stick"]').forEach(function (a) { a.href = 'https://wa.me/' + String(S.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent('Ciao ' + (S.site_name || 'HEHE CAR') + ', vorrei un preventivo per un trasporto.'); });
    $all('[data-hydrate="email"]').forEach(function (a) { a.textContent = S.email; a.href = 'mailto:' + S.email; });
    $all('[data-hydrate="text"]').forEach(function (el) { var k = el.getAttribute('data-key'); if (S[k]) el.textContent = S[k]; });
    $all('[data-hydrate="site-name"]').forEach(function (el) { var parts = String(S.site_name || '').split(' '); el.innerHTML = esc(parts[0]) + (parts[1] ? ' <b>' + esc(parts.slice(1).join(' ')) + '</b>' : ''); });
    document.title = document.title.replace(/HEHE CAR/g, S.site_name || 'HEHE CAR');

    var services = active(R.services).sort(byOrder);
    var vehicles = active(R.vehicles).sort(byOrder);
    var extras = active(R.extras).sort(byOrder);

    // widget: tab servizi, veicoli, extra
    $all('form[data-quote]').forEach(function (form) {
      var compact = form.getAttribute('data-compact') === '1';
      var suf = compact ? 'c' : '';
      var tabs = $('.tabs', form);
      if (tabs) {
        var cur = (form.querySelector('input[name="service_id"]:checked') || {}).value;
        tabs.innerHTML = services.map(function (s, i) {
          var checked = cur ? String(s.id) === String(cur) : i === 0;
          return '<input type="radio" name="service_id" id="svc' + s.id + suf + '" value="' + s.id + '" data-mode="' + esc(s.mode) + '" data-min-hours="' + esc(s.min_hours) + '"' + (checked ? ' checked' : '') + '><label for="svc' + s.id + suf + '">' + esc(s.name) + '</label>';
        }).join('');
      }
      var vsel = $('select[name="vehicle_id"]', form);
      if (vsel) {
        // Gli id nell'HTML statico possono non corrispondere a quelli delle regole: si parte sempre dal primo
        // veicolo dell'elenco. L'eventuale veicolo scelto nell'indirizzo viene applicato dopo, dalla pagina preventivo.
        var vcur = vehicles.length ? vehicles[0].id : '';
        vsel.innerHTML = vehicles.map(function (v) { return '<option value="' + v.id + '"' + (String(v.id) === String(vcur) ? ' selected' : '') + '>' + esc(v.name) + (Number(v.wheelchair) ? ' · rampa carrozzina' : '') + (Number(v.custom_quote) === 1 ? ' · prezzo su richiesta' : '') + '</option>'; }).join('');
      }
      var xwrap = $('[data-hydrate="extras"]', form);
      if (xwrap) {
        xwrap.innerHTML = '<span class="lbl">Serve altro?</span>' + extras.map(function (x) {
          return '<label class="check"><input type="checkbox" name="extras[]" value="' + x.id + '"><span><b>' + esc(x.name) + '</b><span class="small muted">' + esc(x.description) + '</span></span><span class="price">+' + fmt(x.price) + ' €' + (x.unit === 'hour' ? '/ora' : x.unit === 'km' ? '/km' : '') + '</span></label>';
        }).join('');
      }
    });

    // card servizi (home e pagina servizi)
    $all('[data-hydrate="services-grid"]').forEach(function (grid) {
      var full = grid.getAttribute('data-full') === '1';
      grid.innerHTML = services.map(function (s) {
        var price = s.mode === 'hourly'
          ? 'da ' + fmt(s.hour_rate) + ' €/ora' + (parseFloat(s.min_hours) > 0 ? ', minimo ' + fmt(s.min_hours, 1) + ' ore' : '')
          : 'da ' + fmt(s.min_fare, 0) + ' € · ' + fmt(s.km_rate) + ' €/km' + (parseInt(s.included_wait_min, 10) > 0 ? ' · ' + parseInt(s.included_wait_min, 10) + ' min di attesa inclusi' : '');
        var list = '';
        if (full) {
          var li = [];
          if (s.mode === 'roundtrip') li.push('Andata, accompagnamento dentro, attesa e ritorno');
          if (s.mode === 'hourly') { li.push('Autista a disposizione, fermate illimitate'); li.push('Minimo ' + fmt(s.min_hours, 1) + ' ore'); }
          if (parseInt(s.included_wait_min, 10) > 0) li.push(parseInt(s.included_wait_min, 10) + ' minuti di attesa inclusi');
          if (Number(s.escort_included)) li.push('Accompagnamento dentro la struttura incluso');
          list = '<ul class="small muted" style="padding-left:1.1rem;margin:0 0 .8rem">' + li.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
        }
        return '<a class="card card-link" href="' + BASE + '/servizi/' + esc(s.slug) + '/"><h3>' + esc(s.name) + '</h3><p>' + esc(s.description) + '</p>' + list + (full ? '' : '<div class="from">' + esc(price) + '</div>') +
          '<span class="lv-go">Vedi il servizio</span></a>';
      }).join('');
    });
    $all('[data-hydrate="vehicles-grid"]').forEach(function (grid) {
      grid.innerHTML = vehicles.map(function (v) { return '<div class="card"><h3>' + esc(v.name) + '</h3><p>' + esc(v.description) + '</p><p class="small muted">' + parseInt(v.seats, 10) + ' passeggeri' + (Number(v.wheelchair) ? ' · accesso in carrozzina con rampa' : '') + '</p></div>'; }).join('');
    });
    $all('[data-hydrate="cta-service"]').forEach(function (a) {
      var slug = a.getAttribute('data-slug'); var s = services.filter(function (x) { return x.slug === slug; })[0] || services[0];
      if (s) a.href = BASE + '/preventivo/?service_id=' + s.id;
    });

    // autisti
    function driverHtml(d, home) {
      var badges = String(d.badges || '').split('|').map(function (b) { return b.trim(); }).filter(Boolean).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('');
      var alt = esc(d.name) + (d.role ? ', ' + esc(d.role) : '');
      var lista = String(d.photos || '').split('|').map(function (f) { return f.trim(); }).filter(Boolean);
      if (d.photo) { lista = [d.photo].concat(lista.filter(function (f) { return f !== d.photo; })); }
      var photo;
      if (lista.length > 1) {
        photo = '<div class="photo-gallery" data-gallery><div class="photo"><img data-main src="' + BASE + '/assets/img/' + esc(lista[0]) + '" alt="' + alt + '"></div>' +
          '<div class="thumbs" role="group" aria-label="Altre foto di ' + esc(d.name) + '">' + lista.map(function (f, i) {
            return '<button type="button" class="thumb' + (i === 0 ? ' is-on' : '') + '" data-src="' + BASE + '/assets/img/' + esc(f) + '" aria-label="Foto ' + (i + 1) + ' di ' + esc(d.name) + '"><img src="' + BASE + '/assets/img/' + esc(f) + '" alt="" loading="lazy"></button>';
          }).join('') + '</div></div>';
      } else {
        photo = '<div class="photo">' + (lista.length ? '<img src="' + BASE + '/assets/img/' + esc(lista[0]) + '" alt="' + alt + '">' : esc(String(d.name).charAt(0))) + '</div>';
      }
      return photo + '<div>' + (home ? '<div class="eyebrow">Chi guida</div>' : '') + '<h2>' + esc(d.name) + '</h2><p class="muted" style="margin-top:-.3rem">' + esc(d.role) + ' · ' + esc(d.languages) + '</p><ul class="badges">' + badges + '</ul><p>' + nl2br(d.bio) + '</p>' + (home ? '<a class="btn ghost" href="' + BASE + '/autisti/">Conosci il team</a>' : '') + '</div>';
    }
    var drivers = active(R.drivers).sort(function (a, b) { return Number(b.featured) - Number(a.featured) || byOrder(a, b); });
    $all('[data-hydrate="driver-featured"]').forEach(function (el) { if (drivers[0]) el.innerHTML = driverHtml(drivers[0], true); });
    $all('[data-hydrate="drivers-list"]').forEach(function (el) { el.innerHTML = drivers.map(function (d) { return '<div class="driver" style="margin-bottom:2.5rem">' + driverHtml(d, false) + '</div>'; }).join(''); });

    // pagina dedicata di un servizio
    var heroSv = $('[data-hydrate="service-hero"]');
    if (heroSv) {
      var sslug = heroSv.getAttribute('data-slug');
      var sv = services.filter(function (x) { return x.slug === sslug; })[0];
      if (sv) {
        var pnt = function (t) { return String(t || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean); };
        var h1s = $('h1', heroSv), leds = $('.lede', heroSv), img = $('.service-photo img', heroSv);
        if (h1s) h1s.textContent = sv.page_title || sv.name;
        if (leds) leds.textContent = sv.page_subtitle || sv.description;
        if (img && sv.image) { img.src = BASE + '/assets/img/servizi/' + sv.image; img.alt = sv.image_alt || ''; }
        document.title = (sv.page_title || sv.name) + ' · ' + (S.site_name || 'HEHE CAR');
        var facts = $('[data-hydrate="service-facts"]');
        if (facts) {
          var f = [];
          if (sv.mode === 'hourly') { f.push(fmt(sv.hour_rate) + " € all'ora"); if (parseFloat(sv.min_hours) > 0) f.push('minimo ' + fmt(sv.min_hours, 1) + ' ore'); }
          else { f.push('da ' + fmt(sv.min_fare, 0) + ' €'); f.push(fmt(sv.km_rate) + ' € al km'); if (parseInt(sv.included_wait_min, 10) > 0) f.push(parseInt(sv.included_wait_min, 10) + ' minuti di attesa inclusi'); }
          f.push('prezzo fisso, si paga alla fine');
          facts.innerHTML = f.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
        }
        var sbody = $('[data-hydrate="service-body"]');
        if (sbody) {
          var html = String(sv.page_body || sv.description).split(/\n\s*\n/).map(function (t) { return '<p>' + esc(t.trim()) + '</p>'; }).join('');
          if (sv.steps) html += '<h2 style="font-size:1.35rem;margin-top:1.6rem">Come si svolge</h2><ol class="numbered">' + pnt(sv.steps).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>';
          sbody.innerHTML = html;
        }
        var inc = $('[data-hydrate="service-included"]');
        if (inc) { inc.hidden = !sv.included; if (sv.included) inc.innerHTML = '<h3>Cosa è compreso</h3><ul class="ticks">' + pnt(sv.included).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'; }
        var nts = $('[data-hydrate="service-notes"]');
        if (nts) { nts.hidden = !sv.notes; if (sv.notes) nts.innerHTML = '<h3>Da sapere prima</h3><ul class="dashes">' + pnt(sv.notes).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'; }
        var scl = $('[data-hydrate="service-closing"]');
        if (scl && sv.page_closing) scl.textContent = sv.page_closing;
        var soth = $('[data-hydrate="service-others"]');
        if (soth) soth.innerHTML = services.map(function (o) {
          return '<a class="card card-link' + (o.slug === sv.slug ? ' is-current' : '') + '" href="' + BASE + '/servizi/' + esc(o.slug) + '/"><h3>' + esc(o.name) + '</h3><p>' + esc(o.description) + '</p><span class="lv-go">' + (o.slug === sv.slug ? 'Sei qui' : 'Vedi il servizio') + '</span></a>';
        }).join('');
      }
    }

    // livelli di aiuto: schede della home e pagine dedicate
    var levels = active(R.help_levels).sort(byOrder);
    function levelCard(lv, corrente) {
      return '<a class="lv' + (Number(lv.ours) ? ' ours' : '') + (corrente ? ' is-current' : '') + '" href="' + BASE + '/aiuto/' + esc(lv.slug) + '/">' +
        '<span class="eyebrow">' + esc(lv.eyebrow) + '</span><b>' + esc(lv.card_title) + '</b>' +
        '<p class="small' + (Number(lv.ours) ? '' : ' muted') + '">' + esc(lv.card_text) + '</p>' +
        '<span class="lv-go">' + (corrente ? 'Sei qui' : 'Vedi come funziona') + '</span></a>';
    }
    $all('[data-hydrate="levels-cards"]').forEach(function (el) {
      if (levels.length) el.innerHTML = levels.map(function (lv) { return levelCard(lv, false); }).join('');
    });
    var heroLv = $('[data-hydrate="level-hero"]');
    if (heroLv && levels.length) {
      var slug = heroLv.getAttribute('data-slug');
      var lv = levels.filter(function (x) { return x.slug === slug; })[0];
      if (lv) {
        var punti = function (s) { return String(s || '').split('|').map(function (t) { return t.trim(); }).filter(Boolean); };
        heroLv.classList.toggle('ours', Number(lv.ours) === 1);
        var eyebrow = $('.eyebrow', heroLv), h1 = $('h1', heroLv), lede = $('.lede', heroLv), alt = $('.sr-only', heroLv);
        if (eyebrow) eyebrow.textContent = lv.eyebrow;
        if (h1) h1.textContent = lv.title;
        if (lede) lede.textContent = lv.subtitle;
        if (alt) alt.textContent = lv.video_alt;
        document.title = lv.title + ' · ' + (S.site_name || 'HEHE CAR');
        var body = $('[data-hydrate="level-body"]');
        if (body) body.innerHTML = String(lv.body || '').split(/\n\s*\n/).map(function (p) { return '<p>' + esc(p.trim()) + '</p>'; }).join('');
        var fits = $('[data-hydrate="level-fits"]');
        if (fits) fits.innerHTML = '<h3>' + esc(lv.fits_title) + '</h3><ul class="ticks">' + punti(lv.fits).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
        var lim = $('[data-hydrate="level-limits"]');
        if (lim) {
          lim.className = 'card ' + (Number(lv.ours) ? 'card-ours' : 'card-limits');
          lim.style.marginTop = '1rem';
          lim.innerHTML = '<h3>' + esc(lv.limits_title) + '</h3><ul class="' + (Number(lv.ours) ? 'ticks' : 'dashes') + '">' + punti(lv.limits).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
        }
        var altri = $('[data-hydrate="level-others"]');
        if (altri) altri.innerHTML = levels.map(function (o) { return levelCard(o, o.slug === lv.slug); }).join('');
        var chiusura = $('[data-hydrate="level-closing"]');
        if (chiusura) chiusura.textContent = lv.closing;
      }
    }

    // pagina prezzi
    var t = function (head, rowsHtml) { return '<table><thead><tr>' + head.map(function (h) { return '<th' + (h.num ? ' class="num"' : '') + '>' + esc(h.l) + '</th>'; }).join('') + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>'; };
    var td = function (v, num) { return '<td' + (num ? ' class="num"' : '') + '>' + v + '</td>'; };
    var P = {
      'prices-services': function () { return t([{ l: 'Servizio' }, { l: 'Diritto di chiamata', num: 1 }, { l: '€ / km', num: 1 }, { l: '€ / ora', num: 1 }, { l: 'Attesa inclusa', num: 1 }, { l: 'Minimo', num: 1 }], services.map(function (s) {
        var sub = s.mode === 'roundtrip' ? 'Andata e ritorno, i km si contano due volte' : s.mode === 'hourly' ? 'A ore, minimo ' + fmt(s.min_hours, 1) + ' ore' : 'Sola andata';
        return '<tr>' + td('<b>' + esc(s.name) + '</b><br><span class="small muted">' + esc(sub) + '</span>') + td(fmt(s.base_fee) + ' €', 1) + td(fmt(s.km_rate) + ' €', 1) + td(fmt(s.hour_rate) + ' €', 1) + td(parseInt(s.included_wait_min, 10) + ' min', 1) + td(fmt(s.min_fare) + ' €', 1) + '</tr>';
      }).join('')); },
      'prices-kmbands': function () { var kb = active(R.km_bands); if (!kb.length) return ''; return t([{ l: 'Fascia' }, { l: 'Servizio' }, { l: 'Da', num: 1 }, { l: 'A', num: 1 }, { l: 'Tariffa', num: 1 }], kb.map(function (k) {
        var svc = services.filter(function (s) { return Number(s.id) === Number(k.service_id); })[0];
        return '<tr>' + td('<b>' + esc(k.name) + '</b>') + td(svc ? esc(svc.name) : 'Tutti i servizi') + td(fmt(k.from_km, 1) + ' km', 1) + td(parseFloat(k.to_km) > 0 ? fmt(k.to_km, 1) + ' km' : 'oltre', 1) + td(k.mode === 'flat' ? fmt(k.value) + ' € fissi' : fmt(k.value) + ' €/km', 1) + '</tr>';
      }).join('')); },
      'prices-bands': function () { return t([{ l: 'Fascia' }, { l: 'Orario' }, { l: 'Giorni' }, { l: 'Chilometrico', num: 1 }, { l: 'Orario', num: 1 }, { l: 'Supplemento', num: 1 }], active(R.time_bands).sort(function (a, b) { return Number(a.priority) - Number(b.priority) || String(a.start_time).localeCompare(b.start_time); }).map(function (b) {
        var days = String(b.weekdays).split(',').map(Number);
        return '<tr>' + td('<b>' + esc(b.name) + '</b>') + td(esc(b.start_time) + ' – ' + esc(b.end_time)) + td(days.length === 7 ? 'tutti' : days.map(function (d) { return GG[d] || d; }).join(', ')) + td('× ' + fmt(b.km_multiplier), 1) + td('× ' + fmt(b.hour_multiplier), 1) + td(fmt(b.surcharge) + ' €', 1) + '</tr>';
      }).join('')); },
      'prices-vehicles': function () { return t([{ l: 'Veicolo' }, { l: 'Posti', num: 1 }, { l: 'Chilometrico', num: 1 }, { l: 'Supplemento', num: 1 }], vehicles.map(function (v) { return '<tr>' + td('<b>' + esc(v.name) + '</b>' + (Number(v.wheelchair) ? '<br><span class="small muted">rampa carrozzina</span>' : '')) + td(parseInt(v.seats, 10), 1) + (Number(v.custom_quote) === 1 ? '<td class="num" colspan="2">Prezzo su richiesta</td>' : td('× ' + fmt(v.multiplier), 1) + td(fmt(v.surcharge) + ' €', 1)) + '</tr>'; }).join('')); },
      'prices-extras': function () { return '<table><tbody>' + extras.map(function (x) { return '<tr>' + td('<b>' + esc(x.name) + '</b><br><span class="small muted">' + esc(x.description) + '</span>') + td(fmt(x.price) + ' €' + (x.unit === 'hour' ? '/ora' : x.unit === 'km' ? '/km' : ''), 1) + '</tr>'; }).join('') + '</tbody></table>'; },
      'prices-holidays': function () { return t([{ l: 'Giorno' }, { l: 'Chilometrico', num: 1 }, { l: 'Supplemento', num: 1 }], active(R.holidays).sort(function (a, b) { return String(a.day).localeCompare(b.day); }).map(function (h) { return '<tr>' + td(esc(h.name) + ' <span class="small muted">(' + esc(h.day) + ')</span>') + td('× ' + fmt(h.km_multiplier), 1) + td(fmt(h.surcharge) + ' €', 1) + '</tr>'; }).join('')); },
      'prices-zones': function () { return '<table><tbody>' + active(R.zone_rules).map(function (z) { return '<tr>' + td('<b>' + esc(z.name) + '</b>' + (z.note ? '<br><span class="small muted">' + esc(z.note) + '</span>' : '')) + td(fmt(z.surcharge) + ' €', 1) + '</tr>'; }).join('') + '</tbody></table>'; }
    };
    Object.keys(P).forEach(function (k) { $all('[data-hydrate="' + k + '"]').forEach(function (el) { var html = P[k](); el.innerHTML = html; var sec = el.closest('[data-hydrate-section]'); if (sec) sec.hidden = !html; }); });
  }

  // ------------------------------------------------------------------ preventivo live nel widget
  function bindLiveQuote(R) {
    $all('form[data-quote]').forEach(function (form) {
      var live = $('[data-live]', form); if (!live) return;
      var timer = null;
      function run() {
        var fd = new FormData(form), body = { extras: [] };
        fd.forEach(function (v, k) { if (k === 'extras[]') body.extras.push(v); else body[k] = v; });
        var mode = (form.querySelector('input[name="service_id"]:checked') || {}).getAttribute ? form.querySelector('input[name="service_id"]:checked').getAttribute('data-mode') : 'oneway';
        if (String(body.pickup || '').trim().length < 3 || (mode !== 'hourly' && String(body.dropoff || '').trim().length < 3)) { live.classList.add('hidden'); return; }
        HCPricing.quote(R, body).then(function (q) {
          if (q.custom_quote) { live.innerHTML = '<div class="meta">Prezzo su richiesta</div><div class="meta">' + esc(q.custom_quote_note) + '</div>'; live.classList.remove('hidden'); return; }
          var meta = [];
          if (q.distance_km > 0) meta.push(String(q.distance_km).replace('.', ',') + ' km' + (q.distance_source === 'stima' ? ' (stima)' : q.distance_source === 'da confermare' ? ' (località da confermare)' : ''));
          meta.push('fascia ' + q.band.name.toLowerCase());
          if (q.min_applied) meta.push('prezzo minimo');
          live.innerHTML = '<div><div class="meta">Prezzo fisso, tutto incluso</div><div class="tot">' + money(q.total, 0) + '</div></div><div class="meta">' + esc(meta.join(' · ')) + '</div>';
          live.classList.remove('hidden');
        }).catch(function (e) { live.innerHTML = '<div class="meta">' + esc(e.message) + '</div>'; live.classList.remove('hidden'); });
      }
      form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 400); });
      form.addEventListener('change', function () { clearTimeout(timer); timer = setTimeout(run, 200); });
      // la logica di visibilità campi è in site.js; qui si rilancia dopo l'idratazione
      $all('input[name="service_id"]', form).forEach(function (r) { if (r.checked) r.dispatchEvent(new Event('change', { bubbles: true })); });
    });
  }

  // ------------------------------------------------------------------ pagina preventivo + prenotazione
  function code() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return 'HC-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + Math.random().toString(16).slice(2, 7).toUpperCase(); }

  function quotePage(R) {
    var form = $('form[data-quote]'); if (!form || !/\/preventivo\/?$/.test(location.pathname)) return;
    var params = new URLSearchParams(location.search);
    if (!params.get('service_id')) return;
    var S = R.settings || {};
    $all('input[name="service_id"]', form).forEach(function (r) { r.checked = r.value === params.get('service_id'); });
    ['pickup', 'dropoff', 'date', 'time', 'hours', 'passengers', 'vehicle_id'].forEach(function (k) { var el = form.querySelector('[name="' + k + '"]'); if (el && params.get(k) !== null) el.value = params.get(k); });
    var ex = params.getAll('extras[]');
    $all('input[name="extras[]"]', form).forEach(function (c) { c.checked = ex.indexOf(c.value) >= 0; });
    $all('input[name="service_id"]', form).forEach(function (r) { if (r.checked) r.dispatchEvent(new Event('change', { bubbles: true })); });

    var column = form.closest('.two') ? form.closest('.two').children[1] : null; if (!column) return;
    column.innerHTML = '<div class="quote-box" id="risultato"><div class="eyebrow">Il tuo preventivo</div><p class="muted">Calcolo in corso…</p></div>';
    var body = { extras: ex }; params.forEach(function (v, k) { if (k !== 'extras[]') body[k] = v; });

    HCPricing.quote(R, body).then(function (q) {
      var qcode = code();
      var needs = ["Aiuto a salire e scendere dall'auto", 'Accompagnamento dentro la struttura', 'Deambulatore o bastone', 'Carrozzina pieghevole', 'Resta in carrozzina (serve rampa)', 'Difficoltà di udito o vista', 'Parla solo inglese'];
      var routeInfo = '<p><b>Da</b> ' + esc(q.pickup) + (q.dropoff ? '<br><b>A</b> ' + esc(q.dropoff) : '') +
        (q.distance_km > 0 ? '<br><span class="small muted">' + String(q.distance_km).replace('.', ',') + ' km' + (q.service.mode === 'roundtrip' ? ' andata e ritorno' : '') + (q.distance_source === 'google' ? ' (percorso stradale)' : q.distance_source === 'stima' ? ' (stima)' : ' (località non riconosciuta: confermeremo i km)') + (q.duration_min ? ', circa ' + q.duration_min + ' min di viaggio' : '') + '</span>' : '') + '</p>';

      var priceBox;
      if (q.custom_quote) {
        priceBox =
          '<div class="quote-box" id="risultato"><div class="eyebrow">La tua richiesta · ' + qcode + '</div><h2 style="font-size:1.4rem">' + esc(q.service.name) + '</h2>' +
          '<p class="muted">' + esc(itDate(q.date)) + ' alle ' + esc(q.time) + ' · ' + esc(q.vehicle.name) + ' · ' + q.passengers + ' passegger' + (q.passengers > 1 ? 'i' : 'o') + '</p>' +
          routeInfo +
          '<div class="note info"><b>Prezzo su richiesta.</b> ' + esc(q.custom_quote_note) + '</div></div>';
      } else {
        var lines = q.lines.map(function (l) { return '<li><span>' + esc(l.label) + '</span><span>' + money(l.amount) + '</span></li>'; }).join('');
        priceBox =
          '<div class="quote-box" id="risultato"><div class="eyebrow">Il tuo preventivo · ' + qcode + '</div><h2 style="font-size:1.4rem">' + esc(q.service.name) + '</h2>' +
          '<p class="muted">' + esc(itDate(q.date)) + ' alle ' + esc(q.time) + ' · ' + esc(q.vehicle.name) + ' · ' + q.passengers + ' passegger' + (q.passengers > 1 ? 'i' : 'o') + '</p>' +
          routeInfo +
          '<ul class="lines">' + lines + (q.min_applied ? '<li><span>Prezzo minimo del servizio</span><span>' + money(q.min_fare) + '</span></li>' : '') + '</ul>' +
          '<div class="total"><span>Totale, tutto incluso</span><span class="amt">' + money(q.total) + '</span></div>' +
          '<p class="small muted" style="margin-top:.4rem">' + esc(S.vat_note || '') + '</p>' +
          (q.distance_source === 'da confermare' ? '<div class="note warn">Non riconosciamo una delle località: il prezzo usa una distanza indicativa. Confermeremo il totale prima del servizio.</div>' : '') + '</div>';
      }

      column.innerHTML = priceBox +
        '<form class="quote-box" id="prenota" style="margin-top:1.2rem"><h2 style="font-size:1.3rem">' + (q.custom_quote ? 'Richiedi la quotazione' : 'Prenota senza pagare nulla ora') + '</h2>' +
        '<div class="row2"><div class="field"><label for="bn">Il tuo nome</label><input id="bn" name="booker_name" required></div><div class="field"><label for="bp">Il tuo telefono</label><input id="bp" name="booker_phone" type="tel" required></div></div>' +
        '<div class="field"><label for="be">La tua email</label><input id="be" name="booker_email" type="email"><span class="hint">Facoltativa: per ricevere la conferma scritta.</span></div>' +
        '<div class="row2"><div class="field"><label for="pn">Chi viaggia (se non sei tu)</label><input id="pn" name="passenger_name" placeholder="Nome del passeggero"></div><div class="field"><label for="pp">Telefono del passeggero</label><input id="pp" name="passenger_phone" type="tel"></div></div>' +
        '<div class="field"><span class="lbl">Di cosa ha bisogno il passeggero</span>' + needs.map(function (t) { return '<label class="check"><input type="checkbox" name="needs[]" value="' + esc(t) + '"><span>' + esc(t) + '</span></label>'; }).join('') + '</div>' +
        '<div class="field"><label for="notes">Note per l\'autista</label><textarea id="notes" name="notes" placeholder="Piano, citofono, numero di volo, reparto, orario della visita…"></textarea></div>' +
        '<button class="btn amber block" type="submit">' + (q.custom_quote ? 'Richiedi il prezzo su WhatsApp' : 'Invia la richiesta su WhatsApp') + '</button>' +
        '<p class="small muted" style="margin:.6rem 0 0">' + (q.custom_quote ? 'Si apre WhatsApp con i dettagli del viaggio già scritti: ti rispondiamo con il prezzo entro poche ore.' : 'Si apre WhatsApp con il riepilogo già scritto: basta premere invio. Ti confermiamo entro poche ore con il nome dell\'autista.') + ' ' + esc(S.cancellation_text || '') + '</p></form>';
      if (window.innerWidth < 900) column.scrollIntoView({ behavior: 'smooth' });

      $('#prenota').addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(e.target), d = {}, needsSel = [];
        fd.forEach(function (v, k) { if (k === 'needs[]') needsSel.push(v); else d[k] = v; });
        var msg = [
          (q.custom_quote ? 'Richiesta di quotazione ' : 'Richiesta ') + qcode + ' · ' + (S.site_name || 'HEHE CAR'),
          'Servizio: ' + q.service.name,
          'Quando: ' + itDate(q.date) + ' alle ' + q.time,
          'Da: ' + q.pickup, q.dropoff ? 'A: ' + q.dropoff : null,
          q.hours > 0 ? 'Durata/attesa: ' + fmt(q.hours, 1) + ' ore' : null,
          'Veicolo: ' + q.vehicle.name + ' · ' + q.passengers + ' passegger' + (q.passengers > 1 ? 'i' : 'o'),
          q.extras_names.length ? 'Extra: ' + q.extras_names.join(', ') : null,
          q.custom_quote ? 'Prezzo: su richiesta, vi chiedo una quotazione per questo veicolo e percorso' : 'Prezzo preventivato: ' + money(q.total) + ' (' + (S.vat_note || '') + ')',
          'Passeggero: ' + (d.passenger_name || d.booker_name) + (d.passenger_phone ? ' · ' + d.passenger_phone : '') + (needsSel.length ? ' · ' + needsSel.join(', ') : ''),
          'Prenotato da: ' + d.booker_name + ' · ' + d.booker_phone + (d.booker_email ? ' · ' + d.booker_email : ''),
          d.notes ? 'Note: ' + d.notes : null
        ].filter(Boolean).join('\n');
        try {
          var mine = JSON.parse(localStorage.getItem('hc_richieste') || '[]');
          mine.unshift({ code: qcode, when: new Date().toISOString(), date: q.date, time: q.time, service: q.service.name, pickup: q.pickup, dropoff: q.dropoff, total: q.custom_quote ? null : q.total, custom_quote: !!q.custom_quote, text: msg });
          localStorage.setItem('hc_richieste', JSON.stringify(mine.slice(0, 20)));
        } catch (err) { /* memoria locale non disponibile */ }
        var wa = 'https://wa.me/' + String(S.whatsapp || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(msg);
        var mail = 'mailto:' + encodeURIComponent(S.email || '') + '?subject=' + encodeURIComponent((q.custom_quote ? 'Richiesta di quotazione ' : 'Richiesta ') + qcode) + '&body=' + encodeURIComponent(msg);
        var doneNote = q.custom_quote
          ? 'Il riepilogo qui sotto è pronto: inviacelo su WhatsApp (consigliato) o via email. Ti prepariamo una quotazione su misura per ' + esc(q.vehicle.name).toLowerCase() + ' e ti richiamiamo entro poche ore con il prezzo.'
          : 'Il riepilogo qui sotto è pronto: inviacelo su WhatsApp (consigliato) o via email. Ti confermiamo entro poche ore con il nome dell\'autista. Nessun pagamento anticipato: prezzo preventivato <b>' + money(q.total) + '</b>.';
        column.innerHTML = '<div class="quote-box"><div class="eyebrow">' + (q.custom_quote ? 'Richiesta di quotazione ' : 'Richiesta ') + qcode + '</div><h2 style="font-size:1.6rem">Grazie, ' + esc(String(d.booker_name).split(' ')[0]) + '. Manda il riepilogo e ci pensiamo noi.</h2>' +
          '<div class="note info">' + doneNote + '</div>' +
          '<p><a class="btn amber block" href="' + wa + '" target="_blank" rel="noopener">Invia su WhatsApp</a></p><p><a class="btn ghost block" href="' + mail + '">Invia via email</a></p>' +
          '<details style="margin-top:1rem"><summary class="small">Vedi il testo del riepilogo</summary><pre style="white-space:pre-wrap;font:inherit;font-size:.92rem;background:var(--ground);padding:.8rem;border-radius:8px">' + esc(msg) + '</pre></details>' +
          '<p class="small muted" style="margin-top:1rem">Oppure chiama il <a href="' + telHref(S.phone) + '">' + esc(S.phone) + '</a> citando il codice ' + qcode + '. ' + esc(S.cancellation_text || '') + '</p>' +
          '<p><a class="btn ghost" href="' + BASE + '/">Torna alla home</a></p></div>';
        column.scrollIntoView({ behavior: 'smooth' });
        window.open(wa, '_blank', 'noopener');
      });
    }).catch(function (e) { column.innerHTML = '<div class="note err">' + esc(e.message) + '</div>'; });
  }

  // ------------------------------------------------------------------ avvio
  fetch(RULES_URL).then(function (r) { return r.json(); }).then(function (R) {
    window.HC_RULES = R;
    hydrate(R);
    bindLiveQuote(R);
    quotePage(R);
    // Google Maps (distanze reali) se c'è la chiave browser
    var key = R.settings && R.settings.google_browser_key;
    if (key && !window.google) { var s = document.createElement('script'); s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&libraries=places&language=it&region=IT'; s.async = true; document.head.appendChild(s); }
  }).catch(function () {
    var el = document.querySelector('[data-live]'); if (el) { el.textContent = 'Regole prezzi non disponibili: chiamaci per il preventivo.'; el.classList.remove('hidden'); }
  });
})();
