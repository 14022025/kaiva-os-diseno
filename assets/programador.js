/* ===========================================================================
   PROGRAMADOR DE REDES — el diálogo "Programar publicación" (vistas/_dialogos.php)

   · Las fotos se pasan a JPEG en el navegador (el servidor no tiene GD e
     Instagram solo acepta JPEG): para Instagram a 1080 px de ancho, que es
     lo que guarda Instagram —si se sube más grande la reduce él, peor—,
     reducidas por pasos con suavizado alto y calidad 95. Se suben una por una
     a /api/redes-medio.php (nginx corta a 2 MB por petición).
   · Los videos se suben TAL CUAL, por trozos de 1,5 MB: recomprimirlos en el
     navegador solo les quitaría calidad. De cada uno se saca la portada (el
     cuadro elegido, en JPEG a tamaño completo) para el reel y las miniaturas.
   · Formatos de Instagram: foto, carrusel, reel e historia. El "video post"
     es un reel con "también en el feed" (la API no publica otro tipo de video).
   · La vista previa dibuja la pieza como va a salir en Instagram (publicación,
     carrusel o historia), LinkedIn o Behance, y se actualiza al escribir.
   · Editar una pieza: un botón con data-abre="dlg-pieza" y data-pieza='{…}'.
     El relleno genérico (data-pre-*) sirve para los campos simples; los
     radios, las imágenes y el texto los pone este archivo.
   =========================================================================== */
(function () {
  'use strict';
  var dlg = document.getElementById('dlg-pieza');
  if (!dlg) return;
  var f = dlg.querySelector('form');
  var $ = function (s) { return f.querySelector(s); };
  var campo = function (n) { return f.elements[n]; };
  var vista = $('[data-vista]'), cajaMedios = $('[data-medios]'), subir = $('[data-subir]'), subirTxt = $('[data-subir-txt]');
  var cuenta = $('[data-cuenta]'), medida = $('[data-medida]'), errorEl = $('[data-error]');
  var medios = [], subiendo = 0, actual = 0;
  var LIM = { instagram: 2200, linkedin: 3000, behance: 0, otro: 0 };
  var esc = function (t) { return String(t || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var red = function () { var r = f.querySelector('input[name="canal"]:checked'); return r ? r.value : 'instagram'; };

  /* ---------- Red y formato ---------- */
  var cajaFormatos = $('[data-formatos]'), ficha = $('[data-ficha]'), ayudaMedios = $('[data-medios-ayuda]');
  var fmtActual = function () { var r = f.querySelector('input[name="formato"]:checked'); return r ? r.value : 'imagen'; }, fmt = fmtActual;
  function ponerFormato(v) { var r = f.querySelector('input[name="formato"][value="' + v + '"]'); if (r && !r.disabled) r.checked = true; }

  /* La ficha técnica de cada formato: lo que hay que exportar para que salga
     a máxima calidad. Medidas oficiales de Instagram (2026). */
  var FICHA = {
    imagen: ['1080 × 1350 (4:5)', 'la vertical, la que más pantalla ocupa. Acepta de 4:5 a 1,91:1; si se sale, la recortamos al centro.'],
    carrusel: ['1080 × 1350 (4:5)', 'hasta 10, fotos y videos mezclados. Todos se recortan a la proporción del primero: usa la misma en todos. Videos de 3 a 60 s.'],
    reel: ['1080 × 1920 (9:16)', 'MP4 H.264 + audio AAC, 30 fps, de 3 s a 15 min, hasta 300 MB. Deja libres los 250 px de abajo: ahí va el texto.'],
    historia: ['1080 × 1920 (9:16)', 'foto, o video MP4 de 3 a 60 s (hasta 100 MB). Las historias no llevan pie de foto: el texto no se publica.'],
    post: ['1200 × 1500 (4:5)', 'LinkedIn se publica a mano: te mandamos el texto y los archivos originales por correo.'],
    articulo: ['1920 × 1080 (portada)', 'LinkedIn se publica a mano: te mandamos el texto por correo.'],
    caso: ['1400 px de ancho', 'Behance se publica a mano: te mandamos el texto y los archivos por correo.']
  };
  var AYUDA = {
    imagen: 'Las fotos se pasan a JPEG a 1080 px de ancho y calidad 95: el tamaño que guarda Instagram, así no la vuelve a comprimir.',
    carrusel: 'El orden es el del carrusel. Fotos a 1080 px y calidad 95; los videos van tal cual, sin recomprimir.',
    reel: 'El video se sube tal cual, sin recomprimir. Exporta a 1080×1920: si es más pequeño, Instagram lo estira y se ve borroso.',
    historia: 'Una sola foto o video por historia. Fotos a 1080 px y calidad 95; videos tal cual.',
    otro: 'Las fotos van en JPEG de alta calidad; los videos tal cual.'
  };
  function pintarFicha() {
    var F = FICHA[fmt()];
    ficha.innerHTML = F ? '<b>' + esc(F[0]) + '</b> · ' + esc(F[1]) : '';
    ayudaMedios.textContent = (red() === 'instagram' && AYUDA[fmt()]) || AYUDA.otro;
    $('[data-medios-tit]').firstChild.nodeValue = fmt() === 'reel' ? 'Video ' : (fmt() === 'imagen' ? 'Foto ' : 'Fotos y videos ');
  }

  function filtrarFormatos() {
    var r = red(), primero = null;
    cajaFormatos.querySelectorAll('label[data-red]').forEach(function (l) {
      var ok = l.getAttribute('data-red').split(' ').indexOf(r) >= 0, inp = l.querySelector('input');
      l.hidden = !ok; inp.disabled = !ok;
      if (ok && !primero) primero = inp;
    });
    var marcado = f.querySelector('input[name="formato"]:checked');
    if ((!marcado || marcado.disabled) && primero) primero.checked = true;
    var soloIg = $('[data-solo-ig]');
    if (soloIg) soloIg.hidden = r !== 'instagram';
    pintarFicha();
  }

  /* ---------- Fotos y videos ---------- */
  var esVideo = function (m) { return m && m.tipo === 'video'; };
  var dur = function (s) { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); };
  var MB = 1024 * 1024;

  function guardarMedios() {
    campo('medios').value = JSON.stringify(medios.filter(function (m) { return m.url; }).map(function (m) {
      return esVideo(m) ? { url: m.url, tipo: 'video', ancho: m.ancho, alto: m.alto, duracion: m.duracion, portada: m.portada || null, portada_ms: m.portada_ms || 0, feed: m.feed !== false }
                        : { url: m.url, ancho: m.ancho, alto: m.alto };
    }));
  }

  function pintarMedios() {
    cajaMedios.innerHTML = medios.map(function (m, i) {
      var vista = esVideo(m)
        ? (m.portada ? '<img src="' + esc(m.portada) + '" alt="">' : '<video src="' + esc(m.local || m.url) + '#t=0.5" muted playsinline preload="metadata"></video>')
        : '<img src="' + esc(m.url || m.local) + '" alt="">';
      var carga = m.url ? '' : (m.progreso != null ? '<span class="os-prog-pct">' + m.progreso + ' %</span>' : '<span class="os-prog-giro" aria-hidden="true"></span>');
      return '<figure class="os-prog-mini' + (m.url ? '' : ' cargando') + '">' + vista +
        '<figcaption>' + (i + 1) + '</figcaption>' +
        (esVideo(m) ? '<span class="os-prog-dur">▶ ' + dur(m.duracion) + '</span>' : '') +
        (m.url ? '<div class="os-prog-mini-acc">' +
          (i > 0 ? '<button type="button" data-mover="' + i + '" data-dir="-1" aria-label="Mover antes">‹</button>' : '') +
          (i < medios.length - 1 ? '<button type="button" data-mover="' + i + '" data-dir="1" aria-label="Mover después">›</button>' : '') +
          '<button type="button" data-quitar="' + i + '" aria-label="Quitar">×</button></div>' : carga) +
        '</figure>';
    }).join('');
    guardarMedios();
    revisarMedida();
    pintarPortada();
    pintarVista();
  }

  /* Lo que se dice al lado del título: medidas del primero y si sirven. */
  function revisarMedida() {
    var m = medios.filter(function (x) { return x.url || x.local; })[0];
    if (!m || !medida || !m.ancho) { if (medida) medida.textContent = ''; return; }
    var r = m.ancho / m.alto, F = fmt(), txt = '— ' + m.ancho + '×' + m.alto + (esVideo(m) ? ' · ' + dur(m.duracion) : ''), aviso = [];
    if (red() === 'instagram') {
      var vertical = Math.abs(r - 9 / 16) < 0.02;
      if (esVideo(m)) {
        if (F === 'reel' || F === 'historia') aviso.push(vertical ? '9:16, perfecto' : 'Instagram lo recorta a 9:16');
        if (Math.min(m.ancho, m.alto) < 1080) aviso.push('menos de 1080 px: se verá suave');
        if (F === 'reel' && m.duracion && (m.duracion < 3 || m.duracion > 900)) aviso.push('un reel dura de 3 s a 15 min');
        if ((F === 'historia' || F === 'carrusel') && m.duracion > 60) aviso.push('pasa de 60 s: Instagram lo rechaza');
        if (F === 'imagen') aviso.push('es un video: elige Reel');
      } else if (F === 'historia') aviso.push(vertical ? '9:16, perfecta para historia' : 'lo ideal en historia es 9:16 (1080×1920)');
      else if (F === 'reel') aviso.push('un reel necesita un video');
      else aviso.push(Math.abs(r - 0.8) < 0.02 ? '4:5, la que más ocupa en el celular' : 'Instagram la acepta');
      if (!esVideo(m) && m.ancho < 1080) aviso.push('menos de 1080 px de ancho: se verá suave');
    }
    medida.textContent = txt + (aviso.length ? ' · ' + aviso.join(' · ') : '');
  }

  /* Dibuja una imagen o un cuadro de video en un canvas del tamaño pedido,
     reduciendo a la mitad por pasos: de 4000 px a 1080 de un salto sale
     dentado; por pasos y con suavizado alto queda nítido. Recorte opcional. */
  function lienzo(fuente, sw, sh, recorte, w, h) {
    var c = document.createElement('canvas'), x;
    var r = recorte || { x: 0, y: 0, w: sw, h: sh };
    var cw = r.w, ch = r.h, src = fuente, sx = r.x, sy = r.y;
    while (cw / 2 >= w && ch / 2 >= h) {
      var p = document.createElement('canvas');
      p.width = Math.round(cw / 2); p.height = Math.round(ch / 2);
      x = p.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(src, sx, sy, cw, ch, 0, 0, p.width, p.height);
      src = p; sx = 0; sy = 0; cw = p.width; ch = p.height;
    }
    c.width = w; c.height = h;
    x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);   // un PNG transparente no sale negro
    x.drawImage(src, sx, sy, cw, ch, 0, 0, w, h);
    return c;
  }

  /* A JPEG en el mejor punto que cabe en 2 MB: calidad 95 y, solo si no
     cabe, baja hasta 85; si aun así no cabe, se achica un 10 % (nunca por
     debajo de 1080 de ancho en Instagram si el original lo tenía). */
  function aBlob(c) {
    return new Promise(function (ok, mal) {
      var intento = function (q) {
        c.toBlob(function (b) {
          if (!b) return mal(new Error('No se pudo convertir la imagen.'));
          if (b.size <= 1.9 * MB) return ok({ blob: b, ancho: c.width, alto: c.height });
          if (q > 0.86) return intento(Math.round((q - 0.05) * 100) / 100);
          var w = Math.round(c.width * 0.9), h = Math.round(c.height * 0.9);
          c = lienzo(c, c.width, c.height, null, w, h); intento(0.9);
        }, 'image/jpeg', q);
      };
      intento(0.95);
    });
  }

  function aJpeg(archivo) {
    return new Promise(function (ok, mal) {
      var img = new Image(), u = URL.createObjectURL(archivo);
      img.onload = function () {
        URL.revokeObjectURL(u);
        var w = img.naturalWidth, h = img.naturalHeight, recorte = null, ig = red() === 'instagram', F = fmt();
        // En el feed Instagram rechaza lo que no esté entre 4:5 y 1,91:1: se recorta al centro.
        if (ig && (F === 'imagen' || F === 'carrusel')) {
          var r = w / h;
          if (r < 0.8) recorte = { x: 0, y: Math.round((h - w / 0.8) / 2), w: w, h: Math.round(w / 0.8) };
          else if (r > 1.91) recorte = { x: Math.round((w - h * 1.91) / 2), y: 0, w: Math.round(h * 1.91), h: h };
        }
        var rw = recorte ? recorte.w : w, rh = recorte ? recorte.h : h;
        // Instagram guarda 1080 de ancho; las demás redes, hasta 2048 por lado.
        var k = ig ? Math.min(1, 1080 / rw) : Math.min(1, 2048 / Math.max(rw, rh));
        aBlob(lienzo(img, w, h, recorte, Math.round(rw * k), Math.round(rh * k))).then(ok, mal);
      };
      img.onerror = function () { URL.revokeObjectURL(u); mal(new Error('Ese archivo no es una imagen que el navegador pueda leer.')); };
      img.src = u;
    });
  }

  function subirFoto(blob) {
    var fd = new FormData();
    fd.append('medio', blob, 'imagen.jpg');
    return fetch('/api/redes-medio.php', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error || 'No se pudo subir.'); return d; });
  }

  /* Lee medidas y duración del video sin subirlo. */
  function datosVideo(src) {
    return new Promise(function (ok) {
      var v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = function () { ok({ ancho: v.videoWidth, alto: v.videoHeight, duracion: v.duration }); };
      v.onerror = function () { ok({ ancho: 0, alto: 0, duracion: 0 }); };   // p. ej. HEVC en un Chrome sin el códec: se sube igual
      v.src = src;
    });
  }

  /* El video, tal cual, en trozos de 1,5 MB y en orden. */
  function subirVideo(archivo, m) {
    var TROZO = 1.5 * MB, id = '';
    var bytes = new Uint8Array(12); crypto.getRandomValues(bytes);
    bytes.forEach(function (b) { id += ('0' + b.toString(16)).slice(-2); });
    var enviar = function (desde) {
      var fd = new FormData(), fin = desde + TROZO >= archivo.size;
      fd.append('subida', id); fd.append('desde', String(desde));
      if (fin) fd.append('fin', '1');
      fd.append('trozo', archivo.slice(desde, desde + TROZO), 'trozo');
      return fetch('/api/redes-medio.php', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) throw new Error(d.error || 'No se pudo subir el video.');
          if (fin) return d;
          m.progreso = Math.min(99, Math.round(d.llevo / archivo.size * 100)); pintarMedios();
          return enviar(d.llevo);
        });
    };
    return enviar(0);
  }

  /* La portada: el cuadro del video en `ms`, a 1080 de ancho, en JPEG. */
  function sacarPortada(m) {
    return new Promise(function (ok, mal) {
      var v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.playsInline = true;
      v.onloadeddata = function () { v.currentTime = Math.min((m.portada_ms || 0) / 1000, Math.max(0, (v.duration || 1) - 0.05)); };
      v.onseeked = function () {
        try {
          var w = v.videoWidth, h = v.videoHeight, k = Math.min(1, 1080 / w);
          aBlob(lienzo(v, w, h, null, Math.round(w * k), Math.round(h * k))).then(ok, mal);
        } catch (e) { mal(e); }
      };
      v.onerror = function () { mal(new Error('El navegador no puede leer este video para sacar la portada.')); };
      v.src = m.local || m.url;
    }).then(function (j) { return subirFoto(j.blob); }).then(function (d) { m.portada = d.url; });
  }

  function subirUno(archivo) {
    var video = /^video\//.test(archivo.type) || /\.(mp4|mov|m4v)$/i.test(archivo.name);
    var m = { local: URL.createObjectURL(archivo) };
    if (video) {
      if (!/\.(mp4|mov|m4v)$/i.test(archivo.name) && !/^video\/(mp4|quicktime)$/.test(archivo.type)) {
        URL.revokeObjectURL(m.local); mostrarError('Instagram solo acepta MP4 o MOV. Exporta el video en MP4 (H.264).'); return Promise.resolve();
      }
      if (archivo.size > 300 * MB) { URL.revokeObjectURL(m.local); mostrarError('El video pesa ' + Math.round(archivo.size / MB) + ' MB: el máximo de Instagram es 300 MB.'); return Promise.resolve(); }
      m.tipo = 'video'; m.progreso = 0; m.feed = true; m.portada_ms = 0;
    }
    medios.push(m); subiendo++; pintarMedios(); estadoSubida();
    var trabajo = video
      ? datosVideo(m.local).then(function (d) {
          m.ancho = d.ancho; m.alto = d.alto; m.duracion = d.duracion;
          // La portada por defecto, en el primer segundo (el cuadro 0 suele ser negro).
          m.portada_ms = Math.round(Math.min(1, (d.duracion || 0) / 2) * 1000);
          pintarMedios();
          return subirVideo(archivo, m);
        }).then(function (d) {
          m.url = d.url; delete m.progreso;
          return sacarPortada(m).catch(function () { /* sin portada: Instagram usa el cuadro de portada_ms */ });
        })
      : aJpeg(archivo).then(function (j) { return subirFoto(j.blob); }).then(function (d) { m.url = d.url; m.ancho = d.ancho; m.alto = d.alto; URL.revokeObjectURL(m.local); delete m.local; });
    return trabajo.catch(function (e) {
      medios.splice(medios.indexOf(m), 1);
      if (m.local) URL.revokeObjectURL(m.local);
      mostrarError(e.message);
    }).then(function () { subiendo--; pintarMedios(); estadoSubida(); });
  }

  function estadoSubida() {
    subirTxt.textContent = subiendo ? 'Subiendo ' + subiendo + '…' : (medios.length ? 'Agregar más' : (fmt() === 'reel' ? 'Subir el video' : 'Subir fotos o videos'));
    var b = $('[data-programar]'); if (b) b.disabled = subiendo > 0;
  }

  subir.addEventListener('change', function () {
    ocultarError();
    var lista = Array.prototype.slice.call(subir.files || []);
    if (medios.length + lista.length > 10) { mostrarError('Instagram admite hasta 10 fotos o videos por carrusel.'); lista = lista.slice(0, Math.max(0, 10 - medios.length)); }
    // El formato sigue a lo que se sube: varios → carrusel; un video suelto en "Foto" → reel.
    if (red() === 'instagram') {
      var total = medios.length + lista.length, unVideo = lista.length === 1 && /^video\/|\.(mp4|mov|m4v)$/i.test(lista[0].type + ' ' + lista[0].name);
      if (total > 1 && (fmt() === 'imagen' || fmt() === 'reel')) ponerFormato('carrusel');
      else if (total === 1 && unVideo && fmt() === 'imagen') ponerFormato('reel');
      pintarFicha();
    }
    lista.reduce(function (p, a) { return p.then(function () { return subirUno(a); }); }, Promise.resolve());
    subir.value = '';
  });

  cajaMedios.addEventListener('click', function (e) {
    var q = e.target.closest('[data-quitar]'), mv = e.target.closest('[data-mover]');
    if (q) { medios.splice(+q.getAttribute('data-quitar'), 1); actual = 0; pintarMedios(); }
    if (mv) {
      var i = +mv.getAttribute('data-mover'), j = i + (+mv.getAttribute('data-dir'));
      var t = medios[i]; medios[i] = medios[j]; medios[j] = t; pintarMedios();
    }
  });

  /* ---------- Portada del reel ---------- */
  var cajaPortada = $('[data-portada]'), vPortada = $('[data-portada-video]'), rango = $('[data-portada-rango]'), txtPortada = $('[data-portada-txt]'), chkFeed = $('[data-feed]');
  var vidPortada = null;
  function pintarPortada() {
    var v = medios[0], ver = red() === 'instagram' && fmt() === 'reel' && esVideo(v);
    cajaPortada.hidden = !ver;
    if (!ver) { vidPortada = null; return; }
    if (vidPortada !== v) {
      vidPortada = v;
      vPortada.src = v.local || v.url || '';
      rango.max = String(Math.max(1, Math.round((v.duracion || 1) * 1000)));
      rango.value = String(v.portada_ms || 0);
      chkFeed.checked = v.feed !== false;
      vPortada.onloadeddata = function () { vPortada.currentTime = (v.portada_ms || 0) / 1000; };
    }
    rango.disabled = !v.url;
    txtPortada.textContent = !v.url ? 'Se puede elegir cuando termine de subir.' : 'Cuadro en ' + dur((v.portada_ms || 0) / 1000) + (v.portada ? ' · portada lista a ' + Math.min(1080, v.ancho || 1080) + ' px' : '') + '.';
  }
  rango.addEventListener('input', function () {
    if (!vidPortada) return;
    vidPortada.portada_ms = +rango.value;
    vPortada.currentTime = +rango.value / 1000;
    txtPortada.textContent = 'Cuadro en ' + dur(+rango.value / 1000) + '…';
  });
  rango.addEventListener('change', function () {
    var v = vidPortada; if (!v || !v.url) return;
    subiendo++; estadoSubida(); txtPortada.textContent = 'Guardando la portada…';
    sacarPortada(v).catch(function (e) { v.portada = null; mostrarError(e.message); })
      .then(function () { subiendo--; estadoSubida(); pintarMedios(); });
  });
  chkFeed.addEventListener('change', function () { if (vidPortada) { vidPortada.feed = chkFeed.checked; guardarMedios(); } });

  /* ---------- Texto ---------- */
  function contar() {
    var t = campo('texto').value, lim = LIM[red()] || 0, n = t.length;
    var tags = (t.match(/#[\wáéíóúñÁÉÍÓÚÑ]+/g) || []).length;
    if (!lim) { cuenta.textContent = n ? '— ' + n + ' caracteres' : ''; cuenta.className = 'os-prog-cuenta'; return; }
    cuenta.textContent = '— ' + n.toLocaleString('es-CO') + ' / ' + lim.toLocaleString('es-CO') + (red() === 'instagram' && tags ? ' · ' + tags + ' de 30 hashtags' : '');
    cuenta.className = 'os-prog-cuenta' + (n > lim || tags > 30 ? ' mal' : '');
  }

  /* ---------- La vista previa ----------
     Fiel en lo que decide cómo se ve: la foto de perfil real (window.KV_IG,
     de vistas/lanzamiento.php), el recorte que aplica cada red, dónde se corta
     el texto y el orden de los elementos. Las letras y los íconos son los del
     sistema, no los de la app: eso cambia un poco según el teléfono. */
  var IG = window.KV_IG || {};
  var AV = IG.avatar || 'assets/kaiva-k.png', USU = IG.usuario || 'kaivastudio';
  var ICO = {
    cora: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>',
    coment: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z"/></svg>',
    enviar: '<svg viewBox="0 0 24 24"><path d="m21 3-9.5 9.5M21 3l-6 18-3.5-8.5L3 9l18-6Z"/></svg>',
    guardar: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>',
    puntos: '<svg viewBox="0 0 24 24" class="pv-relleno"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    mundo: '<svg viewBox="0 0 16 16" class="pv-mundo"><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c2 2.2 2 10.8 0 13M8 1.5c-2 2.2-2 10.8 0 13"/></svg>',
    recomendar: '<svg viewBox="0 0 24 24"><path d="M7 10v10H4V10h3Zm0 0 4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 16.8 20H7"/></svg>',
    compartir: '<svg viewBox="0 0 24 24"><path d="M17 3l4 4-4 4M21 7H9a5 5 0 0 0-5 5v8"/></svg>'
  };

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function fechaTxt(larga) {
    var d = campo('fecha_publicacion').value, h = campo('hora').value;
    if (!d) return '';
    var p = d.split('-');
    return larga ? (+p[2]) + ' de ' + MESES[+p[1] - 1] : (+p[2]) + ' ' + MESES[+p[1] - 1].slice(0, 3) + (h ? ' · ' + h : '');
  }

  /* El corte del texto: Instagram enseña 2 líneas (unos 125 caracteres) y
     LinkedIn 3 (unos 210) antes del "más"; un salto de línea gasta una línea. */
  function cortar(t, lineas, chars, mas) {
    t = String(t || '');
    var partes = t.split('\n'), salida = [], usados = 0, cortado = false;
    for (var i = 0; i < partes.length; i++) {
      if (salida.length >= lineas || usados >= chars) { cortado = true; break; }
      var resto = chars - usados, linea = partes[i];
      if (linea.length > resto) { salida.push(linea.slice(0, resto).replace(/\s+\S*$/, '')); cortado = true; break; }
      salida.push(linea); usados += linea.length;
    }
    if (!cortado && salida.length < partes.length) cortado = true;
    return salida.map(esc).join('<br>') + (cortado ? '<span class="pv-mas">… ' + mas + '</span>' : '');
  }

  /* El recorte de Instagram en el feed: entre 4:5 (vertical) y 1,91:1 (horizontal). */
  function ratioIg(m) {
    if (!m || !m.ancho) return '1/1';
    var r = Math.max(0.8, Math.min(1.91, m.ancho / m.alto));
    return r.toFixed(4) + '/1';
  }

  /* EN EL FEED (Sara, 2026-10-13): la cuadrícula del perfil con esta pieza
     delante de lo que ya está en cola y de lo publicado, recortada a 3:4
     como la muestra Instagram. */
  var modo = 'post';
  var aside = dlg.querySelector('.os-prog-der'), modos = dlg.querySelector('[data-modos]');
  function pintarFeed(ok) {
    var yo = campo('id').value;
    var celdas = ['<div class="pv-feed-celda esta">' + (ok[0] ? medio(ok[0], true) : '<span>Sin imagen</span>') + '<b>Esta</b></div>'];
    (IG.cola || []).forEach(function (q) { if (String(q.id) !== yo && q.img) celdas.push('<div class="pv-feed-celda cola"><img src="' + esc(q.img) + '" alt=""></div>'); });
    (IG.grid || []).forEach(function (u) { celdas.push('<div class="pv-feed-celda"><img src="' + esc(u) + '" alt="" referrerpolicy="no-referrer"></div>'); });
    return '<div class="pv pv-feed"><div class="pv-cab"><img class="pv-av" src="' + esc(AV) + '" alt="" referrerpolicy="no-referrer"><b>' + esc(USU) + '</b></div>' +
      '<div class="pv-feed-grid">' + celdas.slice(0, 12).join('') + '</div></div>';
  }
  modos.addEventListener('click', function (e) {
    var a = e.target.closest('[data-modo]'); if (!a) return;
    e.preventDefault(); modo = a.getAttribute('data-modo');
    modos.querySelectorAll('[data-modo]').forEach(function (x) { if (x === a) x.setAttribute('aria-current', 'page'); else x.removeAttribute('aria-current'); });
    pintarVista();
  });
  /* Ampliar: la vista previa a pantalla completa, encima del editor. Esc
     solo la achica: no cierra el editor (que al cerrarse se vacía). */
  function ampliar(si) { aside.classList.toggle('grande', si); }
  dlg.querySelector('[data-ampliar]').addEventListener('click', function () { ampliar(!aside.classList.contains('grande')); });
  aside.addEventListener('click', function (e) { if (e.target === aside && aside.classList.contains('grande')) ampliar(false); });
  dlg.addEventListener('cancel', function (e) { if (aside.classList.contains('grande')) { e.preventDefault(); ampliar(false); } });

  /* Una foto o un video dentro de la vista previa. `quieto`: la portada (para la cuadrícula). */
  function medio(m, quieto) {
    if (!esVideo(m)) return '<img src="' + esc(m.url || m.local) + '" alt="">';
    if (quieto && m.portada) return '<img src="' + esc(m.portada) + '" alt="">';
    return '<video src="' + esc(m.local || m.url) + '"' + (quieto ? ' preload="metadata"' : ' autoplay loop') + ' muted playsinline' + (m.portada ? ' poster="' + esc(m.portada) + '"' : '') + '></video>';
  }

  function pintarVista() {
    // Escribir el texto repinta la vista: el video sigue donde iba, no vuelve a empezar.
    var antes = vista.querySelector('video'), seg = antes ? antes.currentTime : 0, srcAntes = antes ? antes.getAttribute('src') : '';
    pintarVista2();
    var ahora = vista.querySelector('video');
    if (ahora && antes && ahora.getAttribute('src') === srcAntes) ahora.currentTime = seg;
  }

  function pintarVista2() {
    var r = red(), fmt = fmtActual(), t = campo('texto').value, ok = medios.filter(function (m) { return m.url || m.local; });
    var conFeed = r === 'instagram' && fmt !== 'historia';
    modos.hidden = !conFeed;
    if (conFeed && modo === 'feed') { vista.innerHTML = pintarFeed(ok); return; }
    if (actual >= ok.length) actual = 0;
    var m0 = ok[actual], primero = ok[0];
    var img = m0 ? medio(m0) : '<div class="pv-vacio">' + (fmt === 'reel' ? 'Aquí va el video' : 'Aquí va la imagen') + '</div>';
    var nav = ok.length > 1 ? '<button type="button" class="pv-fl izq" data-pv="-1" aria-label="Anterior">‹</button><button type="button" class="pv-fl der" data-pv="1" aria-label="Siguiente">›</button>' : '';
    var puntos = ok.length > 1 ? '<div class="pv-puntos">' + ok.map(function (_, i) { return '<i' + (i === actual ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' : '';
    var av = '<img class="pv-av" src="' + esc(AV) + '" alt="" referrerpolicy="no-referrer">';
    var html;
    if (r === 'instagram' && fmt === 'reel') {
      // Reel: 9:16 a pantalla completa, botones a la derecha y el texto encima del video.
      html = '<div class="pv pv-historia pv-reel"><div class="pv-media" style="aspect-ratio:9/16">' + img + '</div>' +
        '<div class="pv-reel-tit">Reels</div>' +
        '<div class="pv-reel-lado">' + ICO.cora + ICO.coment + ICO.enviar + ICO.puntos + '</div>' +
        '<div class="pv-reel-pie"><div class="pv-cab">' + av + '<b>' + esc(USU) + '</b><span class="pv-seguir">Seguir</span></div>' +
        '<p class="pv-txt">' + (t ? cortar(t, 1, 60, 'más') : '<span class="pv-gris">El texto aparece aquí.</span>') + '</p></div>' +
        (m0 && esVideo(m0) && m0.feed === false ? '<span class="pv-n">Solo en Reels</span>' : '') + '</div>';
    } else if (r === 'instagram' && fmt === 'historia') {
      html = '<div class="pv pv-historia"><div class="pv-media" style="aspect-ratio:9/16">' + img + nav + '</div>' +
        '<div class="pv-barras">' + (ok.length ? ok : [0]).map(function (_, i) { return '<i' + (i < actual ? ' class="lleno"' : i === actual ? ' class="va"' : '') + '></i>'; }).join('') + '</div>' +
        '<div class="pv-cab sobre">' + av + '<b>' + esc(USU) + '</b><span>Ahora</span><span class="pv-esp"></span>' + ICO.puntos + '</div>' +
        '<div class="pv-hist-pie"><span>Enviar mensaje</span>' + ICO.cora + ICO.enviar + '</div></div>';
    } else if (r === 'instagram') {
      html = '<div class="pv pv-ig"><div class="pv-cab">' + av + '<b>' + esc(USU) + '</b><span class="pv-esp"></span>' + ICO.puntos + '</div>' +
        '<div class="pv-media" style="aspect-ratio:' + ratioIg(primero) + '">' + img + nav +
          (ok.length > 1 ? '<span class="pv-n">' + (actual + 1) + '/' + ok.length + '</span>' : '') + '</div>' +
        '<div class="pv-acc">' + ICO.cora + ICO.coment + ICO.enviar + puntos + '<span class="pv-esp"></span>' + ICO.guardar + '</div>' +
        '<p class="pv-txt">' + (t ? '<b>' + esc(USU) + '</b> ' + cortar(t, 2, 125, 'más') : '<span class="pv-gris">El texto aparece aquí.</span>') + '</p>' +
        '<span class="pv-fecha">' + esc(fechaTxt(true)) + '</span></div>';
    } else if (r === 'linkedin') {
      html = '<div class="pv pv-li"><div class="pv-cab">' + av.replace('pv-av', 'pv-av pv-av--cuadrado') + '<div><b>Kaiva Studio</b><span>Diseño web, marca y software · Barranquilla</span><span>Ahora · ' + ICO.mundo + '</span></div><span class="pv-esp"></span><span class="pv-seguir">+ Seguir</span></div>' +
        '<p class="pv-txt">' + (t ? cortar(t, 3, 210, 'más') : '<span class="pv-gris">El texto aparece aquí.</span>') + '</p>' +
        (m0 ? '<div class="pv-media" style="aspect-ratio:' + (fmt === 'carrusel' ? '4/5' : ratioIg(primero)) + '">' + img + nav +
          (ok.length > 1 ? '<span class="pv-n">' + (actual + 1) + ' / ' + ok.length + '</span>' : '') + '</div>' : '') +
        '<div class="pv-acc li"><span>' + ICO.recomendar + 'Recomendar</span><span>' + ICO.coment + 'Comentar</span><span>' + ICO.compartir + 'Compartir</span><span>' + ICO.enviar + 'Enviar</span></div></div>';
    } else {
      html = '<div class="pv pv-be"><div class="pv-media" style="aspect-ratio:808/632">' + img + '</div>' +
        '<div class="pv-be-pie">' + av + '<div><b>' + esc(campo('titulo').value || (t.split('\n')[0] || 'Título del proyecto')) + '</b><span>Kaiva Studio</span></div></div></div>';
    }
    vista.innerHTML = html;
  }

  vista.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pv]'); if (!b) return;
    var n = medios.filter(function (m) { return m.url || m.local; }).length;
    actual = (actual + (+b.getAttribute('data-pv')) + n) % n; pintarVista();
  });

  var btnBorrar = dlg.querySelector('[data-borrar]');
  if (btnBorrar) btnBorrar.addEventListener('click', function (e) {
    if (!confirm('¿Eliminar esta publicación? Se borran también sus imágenes.')) e.preventDefault();
    else subiendo = 0;
  });

  /* ---------- Errores y envío ---------- */
  function mostrarError(t) { errorEl.textContent = t; errorEl.hidden = false; }
  function ocultarError() { errorEl.hidden = true; }

  f.addEventListener('submit', function (e) {
    var programar = e.submitter && e.submitter.value === '1';
    var r = red(), fmt = fmtActual(), lista = medios.filter(function (m) { return m.url; }), n = lista.length;
    var videos = lista.filter(esVideo).length;
    var auto = r === 'instagram' && campo('publicar_auto').checked;
    ocultarError();
    if (subiendo) { e.preventDefault(); return mostrarError('Espera a que terminen de subir las imágenes.'); }
    if (!campo('texto').value.trim() && !campo('titulo').value.trim()) { e.preventDefault(); return mostrarError('Escribe el texto o un título.'); }
    if (programar && auto && !n) { e.preventDefault(); return mostrarError('Para que Instagram la publique sola, sube al menos una foto o un video.'); }
    if (programar && auto && fmt === 'carrusel' && n < 2) { e.preventDefault(); return mostrarError('Un carrusel necesita al menos 2 fotos o videos.'); }
    if (programar && auto && fmt === 'reel' && (videos !== 1 || n !== 1)) { e.preventDefault(); return mostrarError('Un reel lleva un solo video. Para varios, elige Carrusel.'); }
    if (programar && auto && fmt === 'imagen' && videos) { e.preventDefault(); return mostrarError('Es un video: elige el formato Reel.'); }
    if (programar && auto && fmt === 'historia' && n > 1) { e.preventDefault(); return mostrarError('Una historia lleva una sola foto o video. Programa una por cada una.'); }
    if (programar && (LIM[r] && campo('texto').value.length > LIM[r])) { e.preventDefault(); return mostrarError('El texto pasa del límite de ' + (r === 'instagram' ? 'Instagram' : 'LinkedIn') + '.'); }
    if (programar) {
      var cuando = campo('fecha_publicacion').value + 'T' + (campo('hora').value || '09:00');
      if (new Date(cuando) < new Date(Date.now() - 60000)) { e.preventDefault(); return mostrarError('Esa hora ya pasó. Para sacarla ya, guárdala y usa «Publicar ahora».'); }
    }
  });

  /* ---------- Abrir (nueva o editar) y cerrar ---------- */
  function cargar(p) {
    medios = []; actual = 0;
    if (p) {
      ['id', 'titulo', 'texto', 'guion', 'fecha_publicacion', 'hora', 'destino'].forEach(function (k) { if (campo(k) && p[k] != null) campo(k).value = p[k]; });
      var radio = f.querySelector('input[name="canal"][value="' + (p.canal || 'instagram') + '"]'); if (radio) radio.checked = true;
      filtrarFormatos();
      if (p.formato) { ponerFormato(p.formato); pintarFicha(); }
      campo('publicar_auto').checked = String(p.publicar_auto) !== '0';
      medios = (p.medios || []).map(function (m) {
        return m.tipo === 'video' ? { url: m.url, tipo: 'video', ancho: m.ancho, alto: m.alto, duracion: m.duracion, portada: m.portada, portada_ms: m.portada_ms || 0, feed: m.feed !== false }
                                  : { url: m.url, ancho: m.ancho, alto: m.alto };
      });
      dlg.querySelector('#dlg-pieza-t').textContent = p.id ? 'Editar publicación' : 'Programar publicación';
    } else {
      dlg.querySelector('#dlg-pieza-t').textContent = 'Programar publicación';
      filtrarFormatos();
    }
    var borrar = dlg.querySelector('[data-borrar]'); if (borrar) borrar.hidden = !(p && p.id);
    ocultarError(); pintarMedios(); contar(); estadoSubida();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-abre="dlg-pieza"]'); if (!b) return;
    var p = null;
    try { p = b.getAttribute('data-pieza') ? JSON.parse(b.getAttribute('data-pieza')) : null; } catch (er) {}
    setTimeout(function () { cargar(p); }, 0);   // después del relleno genérico de data-pre-*
  });

  dlg.addEventListener('close', function () {
    ampliar(false);
    f.reset();
    campo('id').value = ''; campo('medios').value = '[]'; campo('estado').value = 'planificado';
    medios.forEach(function (m) { if (m.local) URL.revokeObjectURL(m.local); });
    medios = []; cajaMedios.innerHTML = ''; ocultarError();
    vidPortada = null; vPortada.removeAttribute('src'); cajaPortada.hidden = true;
    filtrarFormatos();
  });

  f.addEventListener('input', function (e) {
    if (e.target.name === 'canal') filtrarFormatos();
    if (e.target.name === 'formato') { pintarFicha(); pintarPortada(); estadoSubida(); }
    if (e.target.name === 'texto' || e.target.name === 'canal') contar();
    if (e.target.name === 'formato' || e.target.name === 'canal') revisarMedida();
    pintarVista();
  });
  f.addEventListener('change', function () { pintarVista(); });

  filtrarFormatos(); contar(); pintarVista();
})();
