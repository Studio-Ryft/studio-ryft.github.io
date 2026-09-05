/* HEHE CAR – motore preventivi lato browser (stessa logica di app/lib/Pricing.php).
   Regole lette da data/regole.json. Distanze: Google Distance Matrix se c'è la chiave browser, altrimenti località note × fattore strada. */
(function (global) {
  'use strict';

  function n(v, dec) { dec = dec == null ? 2 : dec; var s = Number(v).toFixed(dec).replace('.', ','); return s.replace(/,?0+$/, '').replace(/,$/, ''); }
  function lower(s) { return String(s || '').toLowerCase(); }
  function esc(re) { return re.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function haversine(a, b) {
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function findPlace(rules, text) {
    var t = lower(text).trim(); if (!t) return null;
    var best = null, bestLen = 0;
    (rules.places || []).forEach(function (p) {
      var cands = [lower(p.name)].concat(lower(p.aliases).split('|').map(function (s) { return s.trim(); }).filter(Boolean));
      cands.forEach(function (c) { if (c && t.indexOf(c) >= 0 && c.length > bestLen) { best = p; bestLen = c.length; } });
    });
    return best;
  }

  function fallbackDistance(rules, from, to) {
    var a = findPlace(rules, from), b = findPlace(rules, to);
    var factor = parseFloat(rules.settings.road_factor || 1.3);
    if (a && b) {
      var km = Math.round(haversine(a, b) * factor * 10) / 10;
      return { km: km, minutes: Math.round(km / 45 * 60), source: 'stima' };
    }
    var d = parseFloat(rules.settings.unknown_km || 25);
    return { km: d, minutes: Math.round(d / 45 * 60), source: 'da confermare' };
  }

  var dmCache = {};
  function distance(rules, from, to) {
    var key = lower(from) + '|' + lower(to);
    if (dmCache[key]) return Promise.resolve(dmCache[key]);
    if (global.google && google.maps && google.maps.DistanceMatrixService) {
      return new Promise(function (resolve) {
        new google.maps.DistanceMatrixService().getDistanceMatrix({ origins: [from], destinations: [to], travelMode: 'DRIVING', region: 'it' }, function (res, status) {
          var el = res && res.rows && res.rows[0] && res.rows[0].elements && res.rows[0].elements[0];
          if (status === 'OK' && el && el.status === 'OK') {
            var out = { km: Math.round(el.distance.value / 100) / 10, minutes: Math.round(el.duration.value / 60), source: 'google' };
            dmCache[key] = out; resolve(out);
          } else resolve(fallbackDistance(rules, from, to));
        });
      });
    }
    return Promise.resolve(fallbackDistance(rules, from, to));
  }

  function bandFor(rules, date, time) {
    var d = new Date(date + 'T' + time + ':00');
    var dow = d.getDay() === 0 ? 7 : d.getDay();
    var hm = time;
    var bands = (rules.time_bands || []).filter(function (b) { return Number(b.active) === 1; }).sort(function (a, b) { return Number(b.priority) - Number(a.priority); });
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var days = String(b.weekdays).split(',').map(Number);
      if (days.indexOf(dow) < 0) continue;
      var s = b.start_time, e = b.end_time;
      var inside = s <= e ? (hm >= s && hm < e) : (hm >= s || hm < e);
      if (inside) return b;
    }
    return { name: 'Standard', km_multiplier: 1, hour_multiplier: 1, surcharge: 0 };
  }

  function holidayFor(rules, date) {
    var md = date.slice(5);
    var hs = (rules.holidays || []).filter(function (h) { return Number(h.active) === 1; });
    for (var i = 0; i < hs.length; i++) if (hs[i].day === date || hs[i].day === md) return hs[i];
    return null;
  }

  function kmBandFor(rules, serviceId, legKm) {
    var all = (rules.km_bands || []).filter(function (b) { return Number(b.active) === 1; }).sort(function (a, b) { return Number(b.service_id) - Number(a.service_id) || Number(a.from_km) - Number(b.from_km); });
    var sids = [Number(serviceId), 0];
    for (var s = 0; s < sids.length; s++) {
      for (var i = 0; i < all.length; i++) {
        var b = all[i]; if (Number(b.service_id) !== sids[s]) continue;
        var from = Number(b.from_km), to = Number(b.to_km);
        if (legKm >= from && (to <= 0 || legKm < to)) return b;
      }
    }
    return null;
  }

  function zoneSurcharges(rules, pickup, dropoff) {
    var p = lower(pickup), d = lower(dropoff), out = [];
    (rules.zone_rules || []).filter(function (z) { return Number(z.active) === 1; }).forEach(function (z) {
      var kws = lower(z.keyword).split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      var hit = false;
      for (var i = 0; i < kws.length && !hit; i++) {
        var re = new RegExp('(^|[^\\p{L}\\p{N}])' + esc(kws[i]) + '(?![\\p{L}\\p{N}])', 'u');
        var inP = re.test(p), inD = re.test(d);
        hit = z.applies_to === 'pickup' ? inP : z.applies_to === 'dropoff' ? inD : (inP || inD);
      }
      if (hit) out.push(z);
    });
    return out;
  }

  function roundTotal(rules, v) {
    var step = parseFloat(rules.settings.rounding || 1);
    if (!(step > 0)) return Math.round(v * 100) / 100;
    return Math.ceil(v / step) * step;
  }

  /** input: {service_id, vehicle_id, pickup, dropoff, date, time, hours, passengers, extras[]} → Promise<quote> */
  function quote(rules, input) {
    var service = (rules.services || []).filter(function (s) { return Number(s.id) === Number(input.service_id) && Number(s.active) === 1; })[0];
    if (!service) return Promise.reject(new Error('Servizio non valido.'));
    var vehicles = (rules.vehicles || []).filter(function (v) { return Number(v.active) === 1; }).sort(function (a, b) { return a.sort_order - b.sort_order; });
    var vehicle = vehicles.filter(function (v) { return Number(v.id) === Number(input.vehicle_id); })[0] || vehicles[0] || { name: 'Standard', multiplier: 1, surcharge: 0 };
    var pickup = String(input.pickup || '').trim(), dropoff = String(input.dropoff || '').trim();
    var date = input.date, time = input.time || '09:00';
    var hours = Math.max(0, parseFloat(String(input.hours || 0).replace(',', '.')) || 0);
    var passengers = Math.max(1, parseInt(input.passengers || 1, 10));
    var extraIds = (input.extras || []).map(Number).filter(Boolean);
    if (!pickup) return Promise.reject(new Error('Indica il luogo di partenza.'));
    var mode = service.mode;
    if (mode !== 'hourly' && !dropoff) return Promise.reject(new Error('Indica la destinazione.'));
    if (mode === 'hourly') { hours = Math.max(hours, parseFloat(service.min_hours) || 0); if (hours <= 0) hours = Math.max(1, parseFloat(service.min_hours) || 0); }

    var lead = parseFloat(rules.settings.min_lead_hours || 3);
    var ts = new Date(date + 'T' + time + ':00').getTime();
    if (isNaN(ts)) return Promise.reject(new Error('Data o ora non valide.'));
    if (ts < Date.now() + lead * 3600000) return Promise.reject(new Error('Serve un preavviso di almeno ' + n(lead, 1) + ' ore. Per urgenze chiamaci al ' + rules.settings.phone + '.'));
    var maxD = parseInt(rules.settings.max_advance_days || 180, 10);
    if (ts > Date.now() + maxD * 86400000) return Promise.reject(new Error('Si può prenotare al massimo ' + maxD + ' giorni prima.'));

    var distP = dropoff ? distance(rules, pickup, dropoff) : Promise.resolve({ km: 0, minutes: 0, source: 'n/a' });
    return distP.then(function (dist) {
      var legKm = dist.km, km = mode === 'roundtrip' ? legKm * 2 : legKm;

      // Veicoli a quotazione personalizzata (van): niente calcolo automatico, si contatta il cliente.
      if (Number(vehicle.custom_quote) === 1) {
        var extraNamesCq = (rules.extras || []).filter(function (x) { return Number(x.active) === 1 && extraIds.indexOf(Number(x.id)) >= 0; }).map(function (x) { return x.name; });
        return {
          service: service, vehicle: vehicle, band: bandFor(rules, date, time), holiday: holidayFor(rules, date),
          pickup: pickup, dropoff: dropoff, date: date, time: time, hours: hours, passengers: passengers,
          extras: extraIds, extras_names: extraNamesCq, leg_km: legKm, distance_km: Math.round(km * 10) / 10,
          duration_min: dist.minutes, distance_source: dist.source, lines: [], subtotal: null, min_fare: null,
          min_applied: false, total: null, custom_quote: true,
          custom_quote_note: rules.settings.custom_quote_note || 'Per questo veicolo prepariamo una quotazione su misura: ti contattiamo entro poche ore con il prezzo.'
        };
      }

      var band = bandFor(rules, date, time), holiday = holidayFor(rules, date);
      var kmMult = parseFloat(band.km_multiplier) || 1, hourMult = parseFloat(band.hour_multiplier) || 1, bandSur = parseFloat(band.surcharge) || 0;
      var holMult = holiday ? parseFloat(holiday.km_multiplier) || 1 : 1, holSur = holiday ? parseFloat(holiday.surcharge) || 0 : 0;
      var vehMult = parseFloat(vehicle.multiplier) || 1, vehSur = parseFloat(vehicle.surcharge) || 0;
      var lines = [];
      function line(label, amount) { lines.push({ label: label, amount: Math.round(amount * 100) / 100 }); }

      var kmRate = parseFloat(service.km_rate) || 0, kmCost = 0;
      var kmBand = km > 0 ? kmBandFor(rules, service.id, legKm) : null;
      var mults = (kmMult !== 1 ? ' × ' + n(kmMult) + ' fascia ' + lower(band.name) : '') + (holMult !== 1 ? ' × ' + n(holMult) + ' festivo' : '') + (vehMult !== 1 ? ' × ' + n(vehMult) + ' ' + lower(vehicle.name) : '');
      if (kmBand && kmBand.mode === 'flat') {
        kmCost = parseFloat(kmBand.value) * kmMult * holMult * vehMult;
        line(kmBand.name + ' (' + n(km, 1) + ' km, prezzo fisso fascia ' + n(kmBand.value) + ' €)' + mults, kmCost);
      } else {
        if (kmBand) kmRate = parseFloat(kmBand.value) || kmRate;
        kmCost = km * kmRate * kmMult * holMult * vehMult;
        if (km > 0) line(n(km, 1) + ' km × ' + n(kmRate) + ' €/km' + (kmBand ? ' (fascia ' + kmBand.name + ')' : '') + mults, kmCost);
      }

      var hourRate = (parseFloat(service.hour_rate) || 0) * hourMult, timeCost = 0;
      var includedH = (parseInt(service.included_wait_min, 10) || 0) / 60;
      if (mode === 'hourly') { timeCost = hours * hourRate; line(n(hours, 1) + ' ore × ' + n(hourRate) + ' €/ora' + (hourMult !== 1 ? ' (fascia ' + lower(band.name) + ')' : ''), timeCost); }
      else if (mode === 'roundtrip') { timeCost = Math.max(0, hours - includedH) * hourRate; line('Attesa durante la visita: ' + n(hours, 1) + ' ore, di cui ' + n(includedH, 1) + ' incluse', timeCost); }
      else if (hours > includedH) { timeCost = (hours - includedH) * hourRate; line('Attesa richiesta oltre i ' + (parseInt(service.included_wait_min, 10) || 0) + ' minuti inclusi', timeCost); }

      var fixed = 0;
      if (parseFloat(service.base_fee) > 0) { fixed += parseFloat(service.base_fee); line('Diritto di chiamata', parseFloat(service.base_fee)); }
      if (bandSur > 0) { fixed += bandSur; line('Supplemento fascia ' + lower(band.name), bandSur); }
      if (holSur > 0) { fixed += holSur; line('Supplemento festivo (' + holiday.name + ')', holSur); }
      if (vehSur > 0) { fixed += vehSur; line('Supplemento veicolo: ' + vehicle.name, vehSur); }
      zoneSurcharges(rules, pickup, dropoff).forEach(function (z) { fixed += parseFloat(z.surcharge) || 0; line('Zona: ' + z.name, parseFloat(z.surcharge) || 0); });

      var extraCost = 0, extraNames = [];
      (rules.extras || []).filter(function (x) { return Number(x.active) === 1 && extraIds.indexOf(Number(x.id)) >= 0; }).forEach(function (x) {
        var c = x.unit === 'hour' ? parseFloat(x.price) * Math.max(1, hours || 1) : x.unit === 'km' ? parseFloat(x.price) * km : parseFloat(x.price);
        extraCost += c; extraNames.push(x.name); line('Extra: ' + x.name, c);
      });

      var subtotal = kmCost + timeCost + fixed + extraCost;
      var minFare = parseFloat(service.min_fare) || 0;
      var total = Math.max(subtotal, minFare);
      var minApplied = total > subtotal;
      total = roundTotal(rules, total);
      return { service: service, vehicle: vehicle, band: band, holiday: holiday, pickup: pickup, dropoff: dropoff, date: date, time: time, hours: hours, passengers: passengers, extras: extraIds, extras_names: extraNames, leg_km: legKm, distance_km: Math.round(km * 10) / 10, duration_min: dist.minutes, distance_source: dist.source, lines: lines, subtotal: Math.round(subtotal * 100) / 100, min_fare: minFare, min_applied: minApplied, total: total, custom_quote: false };
    });
  }

  global.HCPricing = { quote: quote, distance: distance, bandFor: bandFor, holidayFor: holidayFor, kmBandFor: kmBandFor, fmt: n };
})(window);
