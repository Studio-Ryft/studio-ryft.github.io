/* Identita visiva sul sito statico: gemello di app/lib/Theme.php.
   Le pagine generate hanno gia il tema scritto nella testata; questo file lo riapplica
   quando il back office salva regole.json senza ricompilare il sito.
   Se cambi i calcoli qui, cambiali anche in Theme.php. */
(function (global) {
  'use strict';

  var GROUND = '#F7F5F0'; // il fondo pagina: i grigi restano caldi mescolandosi con questo

  var FONTS = {
    'Nunito': { pesi: '400;700;800;900', ripiego: 'system-ui, sans-serif' },
    'Source Sans 3': { pesi: '400;600;700', ripiego: 'system-ui, sans-serif' },
    'Inter': { pesi: '400;600;700;800', ripiego: 'system-ui, sans-serif' },
    'Manrope': { pesi: '400;600;700;800', ripiego: 'system-ui, sans-serif' },
    'Poppins': { pesi: '400;600;700;800', ripiego: 'system-ui, sans-serif' },
    'Work Sans': { pesi: '400;600;700;800', ripiego: 'system-ui, sans-serif' },
    'Lora': { pesi: '400;600;700', ripiego: 'Georgia, serif' },
    'Playfair Display': { pesi: '500;700;800', ripiego: 'Georgia, serif' },
    'Merriweather': { pesi: '400;700', ripiego: 'Georgia, serif' },
    'Fraunces': { pesi: '400;600;700', ripiego: 'Georgia, serif' }
  };

  function parti(hex, ripiego) {
    var h = String(hex == null ? '' : hex).trim().replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return ripiego || [15, 110, 122];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function mix(a, b, q) {
    var x = parti(a), y = parti(b, [255, 255, 255]);
    return '#' + [0, 1, 2].map(function (i) {
      return ('0' + Math.round(x[i] + (y[i] - x[i]) * q).toString(16)).slice(-2);
    }).join('').toUpperCase();
  }

  function nomeFont(n, predefinito) {
    n = String(n == null ? '' : n).trim();
    return FONTS[n] ? n : predefinito;
  }

  function variabili(S) {
    S = S || {};
    var brand = String(S.brand_color || '').trim() || '#0F6E7A';
    var accent = String(S.accent_color || '').trim() || '#E0A32E';
    var ink = String(S.ink_color || '').trim() || '#1E2A32';
    var ft = nomeFont(S.font_titoli, 'Nunito');
    var fc = nomeFont(S.font_testo, 'Source Sans 3');
    return {
      '--brand': brand,
      '--brand-dark': mix(brand, '#000000', .22),
      '--brand-soft': mix(brand, '#FFFFFF', .86),
      '--brand-rgb': parti(brand).join(','),
      '--amber': accent,
      '--amber-dark': mix(accent, '#000000', .18),
      '--amber-soft': mix(accent, '#FFFFFF', .88),
      '--amber-rgb': parti(accent, [224, 163, 46]).join(','),
      '--ink': ink,
      '--ink-2': mix(ink, '#FFFFFF', .20),
      '--muted': mix(ink, GROUND, .42),
      '--line': mix(ink, GROUND, .90),
      '--ink-rgb': parti(ink, [30, 42, 50]).join(','),
      '--font-titoli': '"' + ft + '", ' + FONTS[ft].ripiego,
      '--font-testo': '"' + fc + '", ' + FONTS[fc].ripiego
    };
  }

  function indirizzoFont(S) {
    S = S || {};
    var scelti = [nomeFont(S.font_titoli, 'Nunito'), nomeFont(S.font_testo, 'Source Sans 3')];
    var visti = {}, parti_ = [];
    scelti.forEach(function (n) {
      if (visti[n]) return;
      visti[n] = 1;
      parti_.push('family=' + n.replace(/ /g, '+') + ':wght@' + FONTS[n].pesi);
    });
    return 'https://fonts.googleapis.com/css2?' + parti_.join('&') + '&display=swap';
  }

  function segno(brand, accent) {
    return '<svg viewBox="0 0 64 64" aria-hidden="true">' +
      '<rect width="64" height="64" rx="14" fill="' + brand + '"/>' +
      '<path d="M14 38l5-12h26l5 12v10H14z" fill="#fff"/>' +
      '<circle cx="22" cy="48" r="5" fill="' + accent + '"/>' +
      '<circle cx="42" cy="48" r="5" fill="' + accent + '"/></svg>';
  }

  /** Applica il tema alla pagina gia caricata. $base serve per il percorso del logo. */
  function applica(S, base) {
    S = S || {};
    var v = variabili(S), radice = document.documentElement;
    Object.keys(v).forEach(function (k) { radice.style.setProperty(k, v[k]); });

    var css = document.querySelector('link[data-hydrate="theme-fonts"]');
    var url = indirizzoFont(S);
    if (css && css.getAttribute('href') !== url) css.setAttribute('href', url);

    var brand = v['--brand'], accent = v['--amber'];
    var icona = document.querySelector('link[data-hydrate="theme-icon"]');
    if (icona) {
      icona.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<rect width="64" height="64" rx="14" fill="' + brand + '"/>' +
        '<path d="M14 38l5-12h26l5 12v10H14z" fill="#fff"/>' +
        '<circle cx="22" cy="48" r="5" fill="' + accent + '"/>' +
        '<circle cx="42" cy="48" r="5" fill="' + accent + '"/></svg>'));
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-hydrate="logo"]'), function (el) {
      var file = String(S.logo || '').trim();
      if (file) {
        var alt = String(S.logo_alt || S.site_name || '').replace(/"/g, '&quot;');
        el.innerHTML = '<img src="' + (base || '') + '/assets/img/' + encodeURIComponent(file) + '" alt="' + alt + '">';
      } else {
        el.innerHTML = segno(brand, accent);
      }
    });
  }

  global.HCTema = { variabili: variabili, indirizzoFont: indirizzoFont, applica: applica, fonts: FONTS };
})(window);
