/* HEHE CAR – interazioni del sito: menu, preventivo live, suggerimenti località, Google Places se c'è la chiave. */
(function () {
  'use strict';
  var BASE = (document.body && document.body.getAttribute('data-base')) || '';
  var STATIC = !!(document.body && document.body.getAttribute('data-static')); // su GitHub Pages: niente API, calcoli in static.js

  // Menu mobile
  var tg = document.querySelector('.menu-toggle');
  var nav = document.querySelector('nav.main');
  if (tg && nav) tg.addEventListener('click', function () { nav.classList.toggle('open'); tg.setAttribute('aria-expanded', nav.classList.contains('open')); });

  // Widget preventivo (in home e nella pagina preventivo)
  document.querySelectorAll('form[data-quote]').forEach(function (form) {
    var modeInputs = form.querySelectorAll('input[name="service_id"]');
    var dropWrap = form.querySelector('[data-dropoff]');
    var hoursWrap = form.querySelector('[data-hours]');
    var hoursLabel = form.querySelector('[data-hours-label]');
    var live = form.querySelector('[data-live]');
    var timer = null;

    function currentMode() {
      var c = form.querySelector('input[name="service_id"]:checked');
      return c ? c.getAttribute('data-mode') : 'oneway';
    }
    function refreshMode() {
      var m = currentMode();
      if (dropWrap) dropWrap.classList.toggle('hidden', m === 'hourly');
      if (hoursWrap) hoursWrap.classList.toggle('hidden', m === 'oneway');
      if (hoursLabel) hoursLabel.textContent = m === 'hourly' ? 'Per quante ore' : 'Durata prevista della visita (ore)';
      var minH = form.querySelector('input[name="service_id"]:checked');
      var hours = form.querySelector('input[name="hours"]');
      if (hours && minH && minH.getAttribute('data-min-hours')) {
        var mh = parseFloat(minH.getAttribute('data-min-hours')) || 0;
        if (m === 'hourly' && parseFloat(hours.value || 0) < mh) hours.value = mh;
        if (m === 'roundtrip' && !hours.value) hours.value = 1.5;
      }
      scheduleQuote();
    }
    modeInputs.forEach(function (i) { i.addEventListener('change', refreshMode); });
    form.querySelectorAll('input,select').forEach(function (el) {
      el.addEventListener('change', scheduleQuote);
      el.addEventListener('input', scheduleQuote);
    });

    function scheduleQuote() {
      if (!live || STATIC) return;
      clearTimeout(timer);
      timer = setTimeout(fetchQuote, 450);
    }
    function fetchQuote() {
      var fd = new FormData(form);
      var m = currentMode();
      var pickup = fd.get('pickup') || '';
      var drop = fd.get('dropoff') || '';
      if (pickup.trim().length < 3 || (m !== 'hourly' && drop.trim().length < 3)) { live.classList.add('hidden'); return; }
      var body = {};
      fd.forEach(function (v, k) {
        if (k === 'extras[]') { (body.extras = body.extras || []).push(v); }
        else body[k] = v;
      });
      fetch(BASE + '/api/preventivo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          live.classList.remove('hidden');
          if (!j.ok) { live.innerHTML = '<div class="meta">' + escapeHtml(j.error || 'Impossibile calcolare.') + '</div>'; return; }
          if (j.custom_quote) { live.innerHTML = '<div class="meta">Prezzo su richiesta</div><div class="meta">' + escapeHtml(j.custom_quote_note || 'Ti contattiamo con una quotazione su misura.') + '</div>'; return; }
          var meta = [];
          if (j.distance_km > 0) meta.push(j.distance_km.toString().replace('.', ',') + ' km' + (j.source === 'stima' ? ' (stima)' : j.source === 'da confermare' ? ' (località da confermare)' : ''));
          meta.push('fascia ' + j.band.toLowerCase());
          if (j.min_applied) meta.push('prezzo minimo');
          live.innerHTML = '<div><div class="meta">Prezzo fisso, tutto incluso</div><div class="tot">' + formatMoney(j.total) + '</div></div><div class="meta">' + escapeHtml(meta.join(' · ')) + '</div>';
        })
        .catch(function () { live.classList.add('hidden'); });
    }
    refreshMode();
  });

  function formatMoney(v) { return Number(v).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €'; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Suggerimenti località (dalla tabella "places"); se c'è Google Places, si usa quello.
  var gkey = document.body.getAttribute('data-gkey') || '';
  var addressInputs = document.querySelectorAll('input[data-address]');
  if (gkey && addressInputs.length) {
    var s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(gkey) + '&libraries=places&language=it&region=IT&callback=__hcPlaces';
    s.async = true; s.defer = true;
    window.__hcPlaces = function () {
      addressInputs.forEach(function (inp) {
        var ac = new google.maps.places.Autocomplete(inp, { componentRestrictions: { country: 'it' }, fields: ['formatted_address', 'name'] });
        ac.addListener('place_changed', function () {
          var p = ac.getPlace();
          if (p && p.formatted_address) inp.value = (p.name && !p.formatted_address.startsWith(p.name) ? p.name + ', ' : '') + p.formatted_address;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    };
    document.head.appendChild(s);
  } else {
    addressInputs.forEach(function (inp) {
      var wrap = inp.parentElement; wrap.classList.add('datalist-wrap');
      var ul = document.createElement('ul'); ul.className = 'suggest hidden'; ul.setAttribute('role', 'listbox'); wrap.appendChild(ul);
      var t = null;
      inp.setAttribute('autocomplete', 'off');
      inp.addEventListener('input', function () {
        clearTimeout(t);
        var q = inp.value.trim();
        if (q.length < 2) { ul.classList.add('hidden'); return; }
        t = setTimeout(function () {
          var source = STATIC
            ? Promise.resolve(((window.HC_RULES && window.HC_RULES.places) || []).map(function (p) { return p.name; }).filter(function (name) { return name.toLowerCase().indexOf(q.toLowerCase()) >= 0; }).slice(0, 12))
            : fetch(BASE + '/api/localita?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); });
          source.then(function (list) {
            ul.innerHTML = '';
            if (!list.length) { ul.classList.add('hidden'); return; }
            list.forEach(function (name) {
              var li = document.createElement('li'); li.textContent = name; li.setAttribute('role', 'option');
              li.addEventListener('mousedown', function (e) { e.preventDefault(); inp.value = name; ul.classList.add('hidden'); inp.dispatchEvent(new Event('change', { bubbles: true })); });
              ul.appendChild(li);
            });
            ul.classList.remove('hidden');
          });
        }, 200);
      });
      inp.addEventListener('blur', function () { setTimeout(function () { ul.classList.add('hidden'); }, 150); });
    });
  }


  // Tab 3D: l'inclinazione segue il mouse (disattivata se l'utente preferisce meno animazioni)
  if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.tabs label').forEach(function (lab) {
      lab.addEventListener('mousemove', function (e) {
        var r = lab.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        lab.style.setProperty('--ry', (px * 14).toFixed(2) + 'deg');
        lab.style.setProperty('--rx', (-py * 12).toFixed(2) + 'deg');
      });
      lab.addEventListener('mouseleave', function () { lab.style.setProperty('--rx', '0deg'); lab.style.setProperty('--ry', '0deg'); });
    });
  }

  // Galleria foto dell'autista: la miniatura cliccata diventa la foto grande.
  // Delegato sul documento perché nella versione statica la galleria viene creata dopo.
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('.photo-gallery .thumb') : null;
    if (!t) return;
    var gal = t.closest('.photo-gallery');
    var main = gal && gal.querySelector('[data-main]');
    var src = t.getAttribute('data-src');
    if (!main || !src || main.getAttribute('src') === src) return;
    var pre = new Image();
    pre.onload = function () { main.src = src; main.classList.remove('swapping'); };
    pre.onerror = function () { main.classList.remove('swapping'); };
    main.classList.add('swapping');
    pre.src = src;
    gal.querySelectorAll('.thumb').forEach(function (x) { x.classList.toggle('is-on', x === t); });
  });

  // Stick WhatsApp: si nasconde in cima alla pagina, torna dopo un piccolo scroll
  var waStick = document.getElementById('waStick');
  if (waStick) {
    var lastY = window.scrollY;
    function updateWaVisibility() {
      var y = window.scrollY;
      waStick.classList.toggle('hide', y < 80);
      lastY = y;
    }
    updateWaVisibility();
    window.addEventListener('scroll', updateWaVisibility, { passive: true });
  }

  // Sfondi video che entrano scorrendo: partono quando la sezione è in vista e si fermano quando esce.
  var sfondi = document.querySelectorAll('.scroll-video');
  if (sfondi.length && 'IntersectionObserver' in window) {
    var ridotto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var osservatore = new IntersectionObserver(function (voci) {
      voci.forEach(function (v) {
        var box = v.target, vid = box.querySelector('video');
        if (v.isIntersecting) {
          box.classList.add('is-on');
          if (vid && !ridotto) { if (vid.preload === 'none') vid.preload = 'auto'; var pr = vid.play(); if (pr && pr.catch) pr.catch(function () {}); }
        } else {
          box.classList.remove('is-on');
          if (vid && !vid.paused) vid.pause();
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.18 });
    sfondi.forEach(function (b) { osservatore.observe(b); });
  } else {
    sfondi.forEach(function (b) { b.classList.add('is-on'); });
  }

  // Data minima nei campi data
  document.querySelectorAll('input[type="date"][data-min-today]').forEach(function (d) {
    var today = new Date(); var iso = today.toISOString().slice(0, 10);
    d.min = iso; if (!d.value) { today.setDate(today.getDate() + 1); d.value = today.toISOString().slice(0, 10); }
  });
})();
