/* HEHE CAR – back office statico: modifica data/regole.json e lo salva su GitHub (Contents API).
   Serve un token GitHub "fine-grained" con permesso Contents: lettura e scrittura sul repository del sito. */
(function () {
  'use strict';
  var CFG = window.HC_ADMIN || { owner: 'Studio-Ryft', repo: 'studio-ryft.github.io', branch: 'main', path: 'hehecar/data/regole.json', imgDir: 'hehecar/assets/img' };
  var API = 'https://api.github.com/repos/' + CFG.owner + '/' + CFG.repo + '/contents/';
  var state = { rules: null, sha: null, token: null, section: 'impostazioni', dirty: false };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------------------------------------------------------------- definizione delle sezioni
  var B = { type: 'bool' };
  var SECTIONS = {
    impostazioni: { title: 'Impostazioni', kind: 'settings', help: 'Dati dell\'attività mostrati nel sito e parametri del calcolo prezzi. La chiave Google Maps è quella "browser": limitala al dominio studio-ryft.github.io nella console Google.', fields: {
      site_name: { label: 'Nome' }, tagline: { label: 'Sottotitolo' }, hero_title: { label: 'Titolo in home', type: 'textarea' }, hero_subtitle: { label: 'Sottotitolo in home', type: 'textarea' },
      phone: { label: 'Telefono (come mostrato)' }, whatsapp: { label: 'WhatsApp (solo cifre con prefisso, es. 393471234567)' }, email: { label: 'Email' }, address: { label: 'Sede' }, service_area: { label: 'Zona servita' },
      google_browser_key: { label: 'Chiave Google Maps (browser, per km reali e autocompletamento)' }, road_factor: { label: 'Fattore strada senza Google (km aria × fattore)', type: 'number', step: '0.05' }, unknown_km: { label: 'Km predefiniti se località sconosciuta', type: 'number', step: '1' },
      rounding: { label: 'Arrotonda il totale a (€, 0 = nessuno)', type: 'number', step: '1' }, min_lead_hours: { label: 'Preavviso minimo (ore)', type: 'number', step: '0.5' }, max_advance_days: { label: 'Anticipo massimo (giorni)', type: 'number', step: '1' },
      vat_note: { label: 'Nota prezzi (IVA, pagamento)' }, cancellation_text: { label: 'Politica di annullamento' },
      custom_quote_note: { label: 'Testo per i veicoli a prezzo su richiesta (van)', type: 'textarea' } } },
    services: { title: 'Servizi e tariffe', kind: 'table', help: 'Ogni servizio ha tariffa al km, tariffa oraria (attesa o servizio a ore), minimo e minuti di attesa inclusi.', fields: {
      name: { label: 'Nome', w: 180 }, slug: { label: 'Slug' }, description: { label: 'Descrizione', type: 'textarea', w: 260 }, mode: { label: 'Modalità', type: 'select', options: { oneway: 'Sola andata', roundtrip: 'Andata, attesa, ritorno', hourly: 'A ore' } },
      base_fee: { label: 'Chiamata €', type: 'number', step: '0.5' }, km_rate: { label: '€/km', type: 'number', step: '0.05' }, hour_rate: { label: '€/ora', type: 'number', step: '0.5' }, included_wait_min: { label: 'Attesa incl. (min)', type: 'number', step: '5' },
      min_fare: { label: 'Minimo €', type: 'number', step: '1' }, min_hours: { label: 'Ore min.', type: 'number', step: '0.5' },
      page_title: { label: 'Titolo pagina', type: 'textarea', w: 200 }, page_subtitle: { label: 'Sottotitolo pagina', type: 'textarea', w: 220 }, page_body: { label: 'Testo pagina', type: 'textarea', w: 360 },
      steps: { label: 'Come si svolge (a|b|c)', type: 'textarea', w: 280 }, included: { label: 'Cosa e compreso (a|b|c)', type: 'textarea', w: 280 }, notes: { label: 'Da sapere prima (a|b|c)', type: 'textarea', w: 280 },
      page_closing: { label: 'Chiusura pagina', type: 'textarea', w: 240 }, image: { label: 'Immagine (assets/img/servizi)', w: 150 }, image_alt: { label: 'Descrizione immagine', type: 'textarea', w: 200 }, image_credits: { label: 'Crediti immagine', type: 'textarea', w: 200 }, escort_included: Object.assign({ label: 'Accomp. incluso' }, B), sort_order: { label: 'Ordine', type: 'number', step: '1' }, active: Object.assign({ label: 'Attivo' }, B) } },
    km_bands: { title: 'Listini per fasce chilometriche', kind: 'table', help: 'Fascia scelta sui km di sola andata. "€/km" sostituisce la tariffa del servizio; "prezzo fisso" vale per tutta la parte chilometrica (poi si applicano fascia oraria, festivo, veicolo). Le fasce del singolo servizio vincono su "Tutti". "A (km)" = 0 significa senza limite.', fields: {
      service_id: { label: 'Servizio', type: 'service' }, name: { label: 'Nome fascia', w: 180 }, from_km: { label: 'Da km', type: 'number', step: '0.5' }, to_km: { label: 'A km (0 = ∞)', type: 'number', step: '0.5' },
      mode: { label: 'Tipo', type: 'select', options: { rate: '€/km', flat: 'Prezzo fisso' } }, value: { label: 'Valore', type: 'number', step: '0.05' }, active: Object.assign({ label: 'Attiva' }, B) } },
    time_bands: { title: 'Fasce orarie', kind: 'table', help: 'Conta l\'ora di partenza. In caso di sovrapposizione vince la priorità più alta. Una fascia 23:00→07:00 attraversa la mezzanotte. Giorni: 1 = lunedì … 7 = domenica, separati da virgola.', fields: {
      name: { label: 'Nome', w: 160 }, start_time: { label: 'Dalle', type: 'time' }, end_time: { label: 'Alle', type: 'time' }, weekdays: { label: 'Giorni (1-7)', w: 130 }, km_multiplier: { label: '× km', type: 'number', step: '0.01' }, hour_multiplier: { label: '× ora', type: 'number', step: '0.01' }, surcharge: { label: 'Suppl. €', type: 'number', step: '0.5' }, priority: { label: 'Priorità', type: 'number', step: '1' }, active: Object.assign({ label: 'Attiva' }, B) } },
    holidays: { title: 'Giorni festivi', kind: 'table', help: 'Giorno ricorrente MM-GG (es. 12-25) oppure singolo AAAA-MM-GG (es. 2027-04-05 per Pasquetta).', fields: {
      name: { label: 'Nome', w: 200 }, day: { label: 'Giorno' }, km_multiplier: { label: '× km', type: 'number', step: '0.01' }, surcharge: { label: 'Suppl. €', type: 'number', step: '0.5' }, active: Object.assign({ label: 'Attivo' }, B) } },
    vehicles: { title: 'Veicoli', kind: 'table', help: 'Il moltiplicatore agisce sul chilometrico (0,85 = 15% in meno della berlina a 1,00); il supplemento è fisso per corsa. Con "Su richiesta" attivo il sito non calcola il prezzo: il cliente invia i dettagli e si risponde con una quotazione su misura.', fields: {
      name: { label: 'Nome', w: 180 }, description: { label: 'Descrizione', type: 'textarea', w: 240 }, seats: { label: 'Posti', type: 'number', step: '1' }, wheelchair: Object.assign({ label: 'Rampa' }, B), custom_quote: Object.assign({ label: 'Su richiesta' }, B), multiplier: { label: '× km', type: 'number', step: '0.01' }, surcharge: { label: 'Suppl. €', type: 'number', step: '0.5' }, sort_order: { label: 'Ordine', type: 'number', step: '1' }, active: Object.assign({ label: 'Attivo' }, B) } },
    extras: { title: 'Servizi extra', kind: 'table', help: 'Prezzo fisso per corsa, per ora (× ore del servizio) o per km.', fields: {
      name: { label: 'Nome', w: 180 }, description: { label: 'Descrizione', type: 'textarea', w: 240 }, price: { label: 'Prezzo €', type: 'number', step: '0.5' }, unit: { label: 'Unità', type: 'select', options: { flat: 'Fisso', hour: 'Per ora', km: 'Per km' } }, sort_order: { label: 'Ordine', type: 'number', step: '1' }, active: Object.assign({ label: 'Attivo' }, B) } },
    zone_rules: { title: 'Supplementi per zona', kind: 'table', help: 'Se una parola chiave (separate da |) compare nell\'indirizzo, si aggiunge il supplemento. Il confronto è per parola intera.', fields: {
      name: { label: 'Nome', w: 180 }, keyword: { label: 'Parole chiave (a|b|c)', w: 220 }, applies_to: { label: 'Su', type: 'select', options: { any: 'Partenza o arrivo', pickup: 'Solo partenza', dropoff: 'Solo arrivo' } }, surcharge: { label: 'Suppl. €', type: 'number', step: '0.5' }, note: { label: 'Nota' }, active: Object.assign({ label: 'Attiva' }, B) } },
    places: { title: 'Località note', kind: 'table', help: 'Servono per i suggerimenti e per stimare i km senza chiave Google (linea d\'aria × fattore strada).', fields: {
      name: { label: 'Nome', w: 220 }, aliases: { label: 'Altri modi di scriverla (a|b)', w: 200 }, lat: { label: 'Latitudine', type: 'number', step: '0.0001' }, lng: { label: 'Longitudine', type: 'number', step: '0.0001' } } },
    help_levels: { title: 'Livelli di aiuto', kind: 'table', help: 'Le tre schede della home e le pagine che si aprono cliccandole. Nel testo lungo lascia una riga vuota fra un paragrafo e il successivo; negli elenchi separa i punti con |. Video e poster sono nomi di file dentro assets/video.', fields: {
      slug: { label: 'Indirizzo (slug)', w: 150 }, eyebrow: { label: 'Sopratitolo', w: 130 }, card_title: { label: 'Titolo scheda', w: 160 }, card_text: { label: 'Testo scheda', type: 'textarea', w: 220 },
      title: { label: 'Titolo pagina', type: 'textarea', w: 220 }, subtitle: { label: 'Sottotitolo', type: 'textarea', w: 240 }, body: { label: 'Testo lungo', type: 'textarea', w: 380 },
      fits_title: { label: 'Titolo elenco 1', w: 150 }, fits: { label: 'Elenco 1 (a|b|c)', type: 'textarea', w: 300 },
      limits_title: { label: 'Titolo elenco 2', w: 150 }, limits: { label: 'Elenco 2 (a|b|c)', type: 'textarea', w: 300 },
      closing: { label: 'Chiusura', type: 'textarea', w: 260 }, video: { label: 'Video', w: 140 }, poster: { label: 'Poster', w: 140 }, video_alt: { label: 'Descrizione video', type: 'textarea', w: 200 },
      ours: Object.assign({ label: 'Il nostro' }, B), sort_order: { label: 'Ordine', type: 'number', step: '1' }, active: Object.assign({ label: 'Attivo' }, B) } },
    drivers: { title: 'Autisti', kind: 'table', help: 'La foto si carica con il pulsante nella colonna Foto (viene salvata nel sito). I badge sono separati da |.', fields: {
      name: { label: 'Nome', w: 160 }, role: { label: 'Ruolo', w: 180 }, bio: { label: 'Presentazione', type: 'textarea', w: 320 }, badges: { label: 'Badge (a|b|c)', type: 'textarea', w: 220 }, languages: { label: 'Lingue' }, photo: { label: 'Foto principale', type: 'photo' }, photos: { label: 'Galleria (file separati da |)', type: 'textarea', w: 200 }, featured: Object.assign({ label: 'In home' }, B), sort_order: { label: 'Ordine', type: 'number', step: '1' }, active: Object.assign({ label: 'Attivo' }, B) } },
    bookings: { title: 'Registro prenotazioni', kind: 'table', help: 'Le richieste arrivano su WhatsApp ed email: registrale qui per avere l\'agenda. È un promemoria interno, non compare nel sito.', fields: {
      date: { label: 'Data', type: 'date' }, time: { label: 'Ora', type: 'time' }, customer: { label: 'Cliente', w: 160 }, phone: { label: 'Telefono' }, route: { label: 'Percorso', type: 'textarea', w: 240 }, service: { label: 'Servizio' }, price: { label: 'Prezzo €', type: 'number', step: '0.5' }, driver: { label: 'Autista' }, status: { label: 'Stato', type: 'select', options: { richiesta: 'Richiesta', confermata: 'Confermata', completata: 'Completata', annullata: 'Annullata' } }, notes: { label: 'Note', type: 'textarea', w: 200 } } }
  };

  // ---------------------------------------------------------------- GitHub
  function ghHeaders(json) { var h = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; if (state.token) h.Authorization = 'Bearer ' + state.token; if (json) h['Content-Type'] = 'application/json'; return h; }
  function b64utf8(str) { var bytes = new TextEncoder().encode(str), bin = ''; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); return btoa(bin); }
  function load() {
    return fetch(API + CFG.path + '?ref=' + CFG.branch + '&t=' + Date.now(), { headers: ghHeaders(false) }).then(function (r) { if (!r.ok) throw new Error('GitHub: ' + r.status + ' ' + r.statusText); return r.json(); }).then(function (j) {
      state.sha = j.sha;
      var txt = new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\n/g, '')), function (c) { return c.charCodeAt(0); }));
      state.rules = JSON.parse(txt);
      if (!state.rules.bookings) state.rules.bookings = [];
    });
  }
  function save(message) {
    state.rules.generated_at = new Date().toISOString();
    var body = { message: message || 'HEHE CAR: aggiornamento regole dal back office', content: b64utf8(JSON.stringify(state.rules, null, 2)), sha: state.sha, branch: CFG.branch };
    return fetch(API + CFG.path, { method: 'PUT', headers: ghHeaders(true), body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || ('GitHub ' + r.status)); state.sha = j.content.sha; state.dirty = false; }); });
  }
  function uploadImage(file) {
    return new Promise(function (resolve, reject) {
      var name = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
      var reader = new FileReader();
      reader.onload = function () {
        var content = String(reader.result).split(',')[1];
        var path = CFG.imgDir + '/' + name;
        fetch(API + path + '?ref=' + CFG.branch, { headers: ghHeaders(false) }).then(function (r) { return r.ok ? r.json() : null; }).then(function (existing) {
          var body = { message: 'HEHE CAR: foto ' + name, content: content, branch: CFG.branch }; if (existing && existing.sha) body.sha = existing.sha;
          return fetch(API + path, { method: 'PUT', headers: ghHeaders(true), body: JSON.stringify(body) });
        }).then(function (r) { if (!r.ok) throw new Error('Caricamento foto non riuscito (' + r.status + ')'); resolve(name); }).catch(reject);
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------------- UI
  var root = $('#app');
  function flash(type, msg) { var f = $('#flash'); f.className = 'note ' + type; f.textContent = msg; f.hidden = false; setTimeout(function () { f.hidden = true; }, 6000); }
  function inputFor(sec, key, def, val, idx) {
    var name = 'data-k="' + key + '" data-i="' + idx + '"';
    var w = def.w ? ' style="min-width:' + def.w + 'px"' : '';
    if (def.type === 'bool') return '<input type="checkbox" ' + name + (Number(val) === 1 ? ' checked' : '') + '>';
    if (def.type === 'select') return '<select ' + name + '>' + Object.keys(def.options).map(function (k) { return '<option value="' + k + '"' + (String(val) === k ? ' selected' : '') + '>' + esc(def.options[k]) + '</option>'; }).join('') + '</select>';
    if (def.type === 'service') return '<select ' + name + '><option value="0"' + (Number(val) === 0 ? ' selected' : '') + '>Tutti i servizi</option>' + (state.rules.services || []).map(function (s) { return '<option value="' + s.id + '"' + (Number(val) === Number(s.id) ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>';
    if (def.type === 'textarea') return '<textarea rows="3" ' + name + w + '>' + esc(val) + '</textarea>';
    if (def.type === 'photo') return '<div style="display:flex;gap:.4rem;align-items:center">' + (val ? '<img src="../assets/img/' + esc(val) + '" alt="" style="width:36px;height:45px;object-fit:cover;border-radius:6px">' : '') + '<input ' + name + ' value="' + esc(val) + '" style="min-width:120px" placeholder="nome file"><label class="btn sm ghost" style="cursor:pointer">Carica<input type="file" accept="image/*" data-photo="' + idx + '" hidden></label></div>';
    return '<input type="' + (def.type === 'number' ? 'number' : def.type === 'time' ? 'time' : def.type === 'date' ? 'date' : 'text') + '" ' + (def.step ? 'step="' + def.step + '" ' : '') + name + w + ' value="' + esc(val) + '">';
  }
  function render() {
    var sec = SECTIONS[state.section], R = state.rules;
    var nav = Object.keys(SECTIONS).map(function (k) { return '<a href="#' + k + '" class="' + (k === state.section ? 'on' : '') + '">' + esc(SECTIONS[k].title) + '</a>'; }).join('');
    var html = '<div class="toolbar"><h1>' + esc(sec.title) + '</h1><div class="actions"><button class="btn" id="save"' + (state.dirty ? '' : ' disabled') + '>Salva su GitHub</button><a class="btn sm ghost" href="../" target="_blank" rel="noopener">Vedi il sito ↗</a><button class="btn sm ghost" id="logout">Esci</button></div></div>' +
      '<div class="help">' + esc(sec.help) + '</div><div class="filters" style="margin-bottom:1rem">' + nav + '</div>';
    if (sec.kind === 'settings') {
      html += '<div class="panel"><div class="form-grid">' + Object.keys(sec.fields).map(function (k) { var d = sec.fields[k]; return '<div class="field' + (d.type === 'textarea' ? ' full' : '') + '"><label>' + esc(d.label) + '</label>' + inputFor('settings', k, d, R.settings[k] || '', 0) + '</div>'; }).join('') + '</div></div>';
    } else {
      var rows = R[state.section] || [];
      html += '<div class="panel"><div class="tablewrap"><table class="edit"><thead><tr><th>#</th>' + Object.keys(sec.fields).map(function (k) { return '<th>' + esc(sec.fields[k].label) + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
        rows.map(function (row, i) { return '<tr><td class="num">' + (i + 1) + '</td>' + Object.keys(sec.fields).map(function (k) { return '<td>' + inputFor(state.section, k, sec.fields[k], row[k] == null ? '' : row[k], i) + '</td>'; }).join('') + '<td><button class="btn sm danger" data-del="' + i + '">Elimina</button></td></tr>'; }).join('') +
        '</tbody></table></div><div class="actions"><button class="btn sm ghost" id="add">+ Aggiungi riga</button></div></div>';
    }
    root.innerHTML = html;
    root.addEventListener('input', onEdit); root.addEventListener('change', onEdit);
    $('#save').addEventListener('click', function () { var b = this; b.disabled = true; b.textContent = 'Salvataggio…'; save().then(function () { flash('ok', 'Salvato. Il sito pubblico si aggiorna entro un minuto circa.'); render(); }).catch(function (e) { flash('err', e.message); b.disabled = false; b.textContent = 'Salva su GitHub'; }); });
    $('#logout').addEventListener('click', function () { sessionStorage.removeItem('hc_gh'); localStorage.removeItem('hc_gh'); location.reload(); });
    var add = $('#add'); if (add) add.addEventListener('click', function () { var row = { id: nextId(state.section) }; Object.keys(sec.fields).forEach(function (k) { var d = sec.fields[k]; row[k] = d.type === 'bool' ? 1 : d.type === 'number' ? 0 : d.type === 'select' ? Object.keys(d.options)[0] : d.type === 'service' ? 0 : ''; }); (state.rules[state.section] = state.rules[state.section] || []).push(row); state.dirty = true; render(); });
    root.querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', function () { if (!confirm('Eliminare questa riga?')) return; state.rules[state.section].splice(Number(b.getAttribute('data-del')), 1); state.dirty = true; render(); }); });
    root.querySelectorAll('input[data-photo]').forEach(function (inp) { inp.addEventListener('change', function () { var f = inp.files[0]; if (!f) return; flash('info', 'Caricamento foto…'); uploadImage(f).then(function (name) { state.rules.drivers[Number(inp.getAttribute('data-photo'))].photo = name; state.dirty = true; render(); flash('ok', 'Foto caricata: ricordati di salvare le regole.'); }).catch(function (e) { flash('err', e.message); }); }); });
  }
  function nextId(sec) { return (state.rules[sec] || []).reduce(function (m, r) { return Math.max(m, Number(r.id) || 0); }, 0) + 1; }
  function onEdit(e) {
    var el = e.target; if (!el.hasAttribute('data-k')) return;
    var k = el.getAttribute('data-k'), i = Number(el.getAttribute('data-i'));
    var v = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.type === 'number' ? (el.value === '' ? 0 : parseFloat(el.value)) : el.value;
    if (SECTIONS[state.section].kind === 'settings') state.rules.settings[k] = String(v); else state.rules[state.section][i][k] = v;
    if (!state.dirty) { state.dirty = true; var s = $('#save'); if (s) s.disabled = false; }
  }

  function loginView(err) {
    root.innerHTML = '<div class="auth quote-box"><div class="eyebrow">HEHE CAR</div><h1 style="font-size:1.6rem">Back office</h1><p class="muted">Le regole del sito vivono su GitHub. Per modificarle serve un token personale con permesso di scrittura sui contenuti del repository <b>' + esc(CFG.owner + '/' + CFG.repo) + '</b>.</p>' + (err ? '<div class="note err">' + esc(err) + '</div>' : '') +
      '<form id="login"><div class="field"><label for="tk">Token GitHub</label><input id="tk" type="password" required autocomplete="off" placeholder="github_pat_…"></div><label class="check"><input type="checkbox" id="remember"><span>Ricorda su questo dispositivo</span></label><button class="btn block" type="submit">Entra</button></form>' +
      '<details style="margin-top:1rem"><summary class="small">Come si crea il token</summary><ol class="small muted" style="padding-left:1.2rem"><li>GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.</li><li>Resource owner: <b>' + esc(CFG.owner) + '</b>. Repository access: solo <b>' + esc(CFG.repo) + '</b>.</li><li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Scadenza a piacere.</li><li>Copia il token e incollalo qui.</li></ol></details></div>';
    $('#login').addEventListener('submit', function (e) { e.preventDefault(); state.token = $('#tk').value.trim(); ($('#remember').checked ? localStorage : sessionStorage).setItem('hc_gh', state.token); start(); });
  }
  function start() {
    root.innerHTML = '<p class="muted">Caricamento regole…</p>';
    load().then(function () {
      // verifica che il token abbia davvero accesso in scrittura (chiamata leggera al repository)
      return fetch('https://api.github.com/repos/' + CFG.owner + '/' + CFG.repo, { headers: ghHeaders(false) }).then(function (r) { return r.json(); }).then(function (j) { if (!j.permissions || !j.permissions.push) throw new Error('Il token non ha permesso di scrittura su questo repository.'); });
    }).then(function () { state.section = (location.hash || '#impostazioni').slice(1); if (!SECTIONS[state.section]) state.section = 'impostazioni'; render(); })
      .catch(function (e) { state.token = null; sessionStorage.removeItem('hc_gh'); localStorage.removeItem('hc_gh'); loginView(e.message); });
  }
  window.addEventListener('hashchange', function () { if (!state.rules) return; if (state.dirty && !confirm('Hai modifiche non salvate: cambiare sezione senza salvare?')) { return; } state.section = location.hash.slice(1) || 'impostazioni'; if (!SECTIONS[state.section]) state.section = 'impostazioni'; render(); });
  window.addEventListener('beforeunload', function (e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
  state.token = sessionStorage.getItem('hc_gh') || localStorage.getItem('hc_gh');
  if (state.token) start(); else loginView();
})();
