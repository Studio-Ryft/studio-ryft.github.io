/* HEHE CAR – modalità vetrina statica (GitHub Pages): preventivo e prenotazione tramite le API del server. */
(function () {
  'use strict';
  var API = window.HC_API;
  if (!API) return;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(v) { return Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  function itDate(ymd) {
    var d = new Date(ymd + 'T00:00:00');
    if (isNaN(d)) return ymd;
    return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Pagina preventivo: se ci sono parametri, calcola tramite API e mostra risultato + modulo di prenotazione
  var form = document.querySelector('form[data-quote]');
  var isQuotePage = /\/preventivo\/?$/.test(location.pathname);
  if (!isQuotePage || !form) return;

  var params = new URLSearchParams(location.search);
  if (!params.get('service_id')) return;

  // Ripristina i valori nel widget
  form.querySelectorAll('input[name="service_id"]').forEach(function (r) { r.checked = r.value === params.get('service_id'); });
  ['pickup', 'dropoff', 'date', 'time', 'hours', 'passengers', 'vehicle_id'].forEach(function (k) {
    var el = form.querySelector('[name="' + k + '"]'); if (el && params.get(k) !== null) el.value = params.get(k);
  });
  var extras = params.getAll('extras[]');
  form.querySelectorAll('input[name="extras[]"]').forEach(function (c) { c.checked = extras.indexOf(c.value) >= 0; });
  form.querySelectorAll('input[name="service_id"]').forEach(function (r) { if (r.checked) r.dispatchEvent(new Event('change', { bubbles: true })); });

  var column = form.closest('.two') ? form.closest('.two').children[1] : null;
  if (!column) return;
  column.innerHTML = '<div class="quote-box" id="risultato"><div class="eyebrow">Il tuo preventivo</div><p class="muted">Calcolo in corso…</p></div>';

  var body = {};
  params.forEach(function (v, k) { if (k === 'extras[]') { (body.extras = body.extras || []).push(v); } else body[k] = v; });

  fetch(API + '/api/preventivo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j.ok) { column.innerHTML = '<div class="note err">' + esc(j.error || 'Impossibile calcolare il preventivo.') + '</div>'; return; }
      var lines = (j.lines || []).map(function (l) { return '<li><span>' + esc(l.label) + '</span><span>' + money(l.amount) + '</span></li>'; }).join('');
      var needs = ["Aiuto a salire e scendere dall'auto", 'Accompagnamento dentro la struttura', 'Deambulatore o bastone', 'Carrozzina pieghevole', 'Resta in carrozzina (serve rampa)', 'Difficoltà di udito o vista', 'Parla solo inglese'];
      var svcName = (form.querySelector('input[name="service_id"]:checked') || {}).nextElementSibling;
      svcName = svcName ? svcName.textContent : '';
      var veh = form.querySelector('[name="vehicle_id"]'); var vehName = veh && veh.selectedOptions[0] ? veh.selectedOptions[0].textContent : '';
      column.innerHTML =
        '<div class="quote-box" id="risultato"><div class="eyebrow">Il tuo preventivo</div>' +
        '<h2 style="font-size:1.4rem">' + esc(svcName) + '</h2>' +
        '<p class="muted">' + esc(itDate(body.date)) + ' alle ' + esc(body.time) + ' · ' + esc(vehName) + ' · ' + esc(body.passengers || 1) + ' passegger' + ((body.passengers || 1) > 1 ? 'i' : 'o') + '</p>' +
        '<p><b>Da</b> ' + esc(body.pickup) + (body.dropoff ? '<br><b>A</b> ' + esc(body.dropoff) : '') +
        (j.distance_km > 0 ? '<br><span class="small muted">' + String(j.distance_km).replace('.', ',') + ' km' + (j.source === 'google' ? ' (percorso stradale)' : j.source === 'stima' ? ' (stima)' : ' (località da confermare)') + (j.duration_min ? ', circa ' + j.duration_min + ' min di viaggio' : '') + '</span>' : '') + '</p>' +
        '<ul class="lines">' + lines + (j.min_applied ? '<li><span>Prezzo minimo del servizio</span><span></span></li>' : '') + '</ul>' +
        '<div class="total"><span>Totale, tutto incluso</span><span class="amt">' + money(j.total) + '</span></div>' +
        '<p class="small muted" style="margin-top:.4rem">Prezzi IVA inclusa. Nessun pagamento anticipato: si paga a fine servizio.</p></div>' +
        '<form class="quote-box" id="prenota" style="margin-top:1.2rem"><h2 style="font-size:1.3rem">Prenota senza pagare nulla ora</h2>' +
        '<div class="row2"><div class="field"><label for="bn">Il tuo nome</label><input id="bn" name="booker_name" required></div><div class="field"><label for="bp">Il tuo telefono</label><input id="bp" name="booker_phone" type="tel" required></div></div>' +
        '<div class="field"><label for="be">La tua email</label><input id="be" name="booker_email" type="email" required><span class="hint">Qui arrivano conferma e aggiornamenti.</span></div>' +
        '<div class="row2"><div class="field"><label for="pn">Chi viaggia (se non sei tu)</label><input id="pn" name="passenger_name" placeholder="Nome del passeggero"></div><div class="field"><label for="pp">Telefono del passeggero</label><input id="pp" name="passenger_phone" type="tel"></div></div>' +
        '<div class="field"><span class="lbl">Di cosa ha bisogno il passeggero</span>' + needs.map(function (n) { return '<label class="check"><input type="checkbox" name="needs[]" value="' + esc(n) + '"><span>' + esc(n) + '</span></label>'; }).join('') + '</div>' +
        '<div class="field"><label for="notes">Note per l\'autista</label><textarea id="notes" name="notes" placeholder="Piano, citofono, numero di volo, reparto, orario della visita…"></textarea></div>' +
        '<input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">' +
        '<button class="btn amber block" type="submit">Invia la richiesta di prenotazione</button>' +
        '<p class="small muted" style="margin:.6rem 0 0">Ti confermiamo entro poche ore con il nome dell\'autista.</p><div class="note err hidden" id="prenota-err"></div></form>';
      if (window.innerWidth < 900) column.scrollIntoView({ behavior: 'smooth' });

      var pf = document.getElementById('prenota');
      pf.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = pf.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = 'Invio in corso…';
        var payload = Object.assign({}, body, { extras: body.extras || [] });
        var fd = new FormData(pf);
        fd.forEach(function (v, k) { if (k === 'needs[]') { (payload.needs = payload.needs || []).push(v); } else payload[k] = v; });
        fetch(API + '/api/prenota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (!res.ok) { var er = document.getElementById('prenota-err'); er.textContent = res.error || 'Invio non riuscito.'; er.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Invia la richiesta di prenotazione'; return; }
            column.innerHTML = '<div class="quote-box"><div class="eyebrow">Richiesta ' + esc(res.code) + '</div><h2 style="font-size:1.6rem">Grazie, abbiamo ricevuto la richiesta.</h2>' +
              '<div class="note info">Ti confermiamo entro poche ore, via email e telefono, con il nome dell\'autista. Nessun pagamento anticipato: il prezzo preventivato è <b>' + money(res.total) + '</b>.</div>' +
              '<p class="small muted">Per modifiche chiama il <a href="tel:' + esc(String(res.phone || '').replace(/\s+/g, '')) + '">' + esc(res.phone || '') + '</a> citando il codice ' + esc(res.code) + '. ' + esc(res.cancellation || '') + '</p>' +
              '<p><a class="btn ghost" href="' + esc(window.HC_BASE || '') + '/">Torna alla home</a> <a class="btn" href="' + esc(res.url) + '">Vedi la tua richiesta</a></p></div>';
            column.scrollIntoView({ behavior: 'smooth' });
          })
          .catch(function () { var er = document.getElementById('prenota-err'); er.textContent = 'Connessione non riuscita: riprova o chiamaci.'; er.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Invia la richiesta di prenotazione'; });
      });
    })
    .catch(function () { column.innerHTML = '<div class="note err">Il servizio di calcolo non risponde. Chiamaci e facciamo il preventivo insieme.</div>'; });
})();
