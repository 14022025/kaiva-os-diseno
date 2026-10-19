/* ===========================================================================
   KAIVA RECAP — la historia animada de Inicio.
   Lee los datos de <script type="application/json" id="kvRecapDatos"> (los
   pone vistas/inicio.php desde src/recap.php) y arma las pantallas.

   · Se abre sola la primera vez que se entra cada día (localStorage) y con
     el botón de la tarjeta de Inicio. ?recap=1 la fuerza.
   · Avanza sola; tocar a la derecha avanza, a la izquierda vuelve; mantener
     apretado pausa. Teclado: ← → espacio Esc. En computador, además, dos
     círculos a los lados de la historia.
   · Una pantalla sin datos no se arma: nunca se enseña un "0" inventado.
   · MODO CLIENTE (D.modo === 'cliente', src/recap.php kaiva_recap_cliente):
     el Recap que se le manda a un cliente. Solo sus datos (Google, visitas,
     salud, lo que hizo Kaiva, lo que sigue); no se abre solo salvo en su
     enlace privado (D.autoabrir) y termina con "Ver de nuevo".

   PIEL (2026-10-19, la del panel nuevo): negro, gris #F0F0F2 y el morado de
   la paleta, en colores planos (ni degradados, ni brillos, ni sombras de
   color). Títulos en dos tonos, cifras grandes que cuentan en 1,6 s con la
   curva de la casa, tarjetas blancas de radio 22, píldoras con su círculo y
   dibujos de línea como los de la tarjeta Recap de Inicio.
   =========================================================================== */
(function () {
  'use strict';
  var nodo = document.getElementById('kvRecapDatos');
  if (!nodo) return;
  var D;
  try { D = JSON.parse(nodo.textContent); } catch (e) { return; }

  var cli = D.modo === 'cliente';
  var quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DURA = 6000;
  var CUENTA = 1600;
  var miles = function (n) { return Math.round(n).toLocaleString('es-CO'); };
  /* La plata sale con su "$" aparte, en morado, como las cifras del panel. */
  var plataTxt = function (n) {
    if (n >= 1e6) return (n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M';
    if (n >= 1e3) return Math.round(n / 1e3).toLocaleString('es-CO') + ' mil';
    return miles(n);
  };
  var plata = function (n) { return '<span class="s">$</span>' + plataTxt(n); };
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var mayus = function (t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
  var a = function (d) { return ' data-a style="--d:' + d + '"'; };
  var num = function (n, fmt) { return '<span data-num="' + n + '" data-fmt="' + (fmt || 'miles') + '">0</span>'; };
  var eti = function (t) { return '<p class="kvr-eti"' + a(.05) + '>' + esc(t) + '</p>'; };

  /* Íconos de las píldoras y los chips (línea, del color de la letra). */
  var ICO = {
    flecha: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    otraVez: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
    sube: '<svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 2l4.5 7h-9z"/></svg>',
    baja: '<svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 10L1.5 3h9z"/></svg>',
    chulo: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.4l2.9 2.9 6.1-6.6"/></svg>',
    cerrar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    izq: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    der: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
  };

  var chipPct = function (p, frente) {
    if (p === null || p === undefined) return '';
    return '<span class="kvr-chip ' + (p >= 0 ? 'bien' : 'mal') + '"' + a(.75) + '>' + (p >= 0 ? ICO.sube + ' +' : ICO.baja + ' −') + Math.abs(p) + '&nbsp;% ' + (frente || 'frente a la semana anterior') + '</span>';
  };
  /* Siete barras, una por día. La del mejor día va rellena de morado y lleva
     su cifra encima; las demás, en gris. */
  var barras = function (serie, unidad) {
    var max = Math.max.apply(null, serie.map(function (x) { return x.v || 0; }).concat([1]));
    var mejor = serie.reduce(function (m, x) { return (x.v || 0) > (m.v || 0) ? x : m; }, serie[0]);
    return '<div class="kvr-caja"' + a(.55) + '><p class="kvr-caja-et">Últimos 7 días</p><div class="kvr-dias">' + serie.map(function (x, i) {
      var h = x.v === null ? 0 : Math.max(4, (x.v / max) * 80);
      var es = x === mejor && x.v;
      return '<div class="' + (es ? 'mejor' : '') + '" title="' + esc(x.dia) + ': ' + (x.v === null ? 'sin dato' : miles(x.v) + ' ' + unidad) + '">' +
        '<b style="--h:' + h.toFixed(1) + '"><i style="--i:' + i + '"></i>' + (es ? '<em>' + miles(x.v) + '</em>' : '') + '</b><span>' + esc(x.dia) + '</span></div>';
    }).join('') + '</div></div>';
  };
  var boton = function (txt, attr, ico, d) {
    return '<button type="button" class="kvr-entrar' + (ico ? '' : ' sin') + '" ' + attr + a(d) + '>' + txt + (ico ? ' <span class="kvr-flecha">' + ico + '</span>' : '') + '</button>';
  };

  /* ---- Las pantallas: cada una solo si tiene datos ----
     { tono, html (lo de arriba), abajo (lo que va al pie), final }
     Sin dibujos (pedido del 2026-10-19): solo texto, cifras y barras. */
  var P = [];

  P.push({ tono: 'oscuro', html:
    (cli && D.tema && D.tema.logo
      ? '<span class="kvr-logo kvr-logo--cliente"' + a(.05) + '><img src="' + esc(D.tema.logo) + '" alt="' + esc(D.marca) + '" width="64" height="64"></span>'
      : '<span class="kvr-logo"' + a(.05) + '><img src="assets/kaiva-k.png" alt="Kaiva" width="64" height="64"></span>') +
    '<p class="kvr-eti"' + a(.2) + '>' + esc(mayus(D.hoy)) + '</p>' +
    (cli
      ? '<h2 class="kvr-titulo kvr-titulo--xl"' + a(.3) + '>Hola,<br><em>' + esc(D.corto) + '.</em></h2>' +
        '<p class="kvr-texto"' + a(.5) + '>Esto fue lo que pasó con <b>' + esc(D.sitio) + '</b> en los últimos 7 días. Toca para avanzar.</p>'
      : '<h2 class="kvr-titulo kvr-titulo--xl"' + a(.3) + '>' + esc(D.saludo) + ',<br><em>Kaiva.</em></h2>' +
        '<p class="kvr-texto"' + a(.5) + '>Esto fue lo que pasó en el estudio en los últimos 7 días. Toca para avanzar.</p>') });

  if (D.google && D.google.total > 0) {
    var g = D.google;
    P.push({ id: 'google', tono: 'claro', html:
      eti('Google') +
      '<div class="kvr-grande"' + a(.15) + '>' + num(g.total) + '<small>veces te vieron en Google</small></div>' +
      chipPct(g.pct) +
      (g.clics ? '<p class="kvr-texto"' + a(.85) + '><b>' + miles(g.clics) + '</b> ' + (g.clics === 1 ? 'persona hizo' : 'personas hicieron') + ' clic para entrar.</p>' : ''),
      abajo: barras(g.serie, 'apariciones') });
  }

  if (D.visitas && D.visitas.total > 0) {
    var v = D.visitas;
    P.push({ id: 'visitas', tono: 'violeta', html:
      eti('Tu sitio') +
      '<div class="kvr-grande"' + a(.15) + '>' + num(v.total) + '<small>' + (v.total === 1 ? 'visita a ' : 'visitas a ') + esc(D.sitio || 'kaivastudio.com') + '</small></div>' +
      chipPct(v.pct) +
      (v.desde_txt
        ? '<p class="kvr-texto"' + a(.85) + '>Empezamos a medir el <b>' + esc(v.desde_txt) + '</b>, así que esta semana está incompleta. Solo cuenta a quien acepta las cookies.</p>'
        : (v.mejor ? '<p class="kvr-texto"' + a(.85) + '>Tu mejor día fue el <b>' + esc(v.mejor.dia_largo || v.mejor.dia) + '</b>, con <b>' + miles(v.mejor.v) + '</b> visitas.</p>' : '')),
      abajo: barras(v.serie, 'visitas') });
  }

  /* Lo que encontramos: los hallazgos que más pesan de la lectura de Google
     (src/lectura-google.php), con su qué hacer. Va justo después de Google y
     visitas, que es de lo que hablan. */
  if (D.hallazgos && D.hallazgos.length) {
    P.push({ tono: 'claro', html:
      eti('Lo que encontramos') +
      '<h2 class="kvr-titulo"' + a(.15) + '>' + (D.hallazgos.length === 1 ? 'Una cosa <em>para mirar.</em>' : D.hallazgos.length + ' cosas <em>para mirar.</em>') + '</h2>' +
      '<ul class="kvr-hz">' + D.hallazgos.map(function (h, i) {
        return '<li class="kvr-hz-' + esc(h.tono) + '"' + a(.4 + i * .18) + '><i></i><b>' + esc(h.titulo) + '</b><span>' + esc(h.accion) + '</span></li>';
      }).join('') + '</ul>' });
  }

  if (!cli && D.redes && D.redes.length) {
    P.push({ id: 'redes', tono: 'oscuro', html:
      eti('Redes') +
      '<h2 class="kvr-titulo"' + a(.15) + '>Tu comunidad <em>esta semana.</em></h2>',
      abajo: '<div class="kvr-caja kvr-redes">' + D.redes.map(function (r, i) {
        var c = r.cambio === null ? '' : (r.cambio === 0 ? '<em class="igual">igual</em>' : '<em class="' + (r.cambio < 0 ? 'baja' : 'sube') + '">' + (r.cambio > 0 ? '+' : '−') + miles(Math.abs(r.cambio)) + '</em>');
        return '<div class="kvr-red"' + a(.4 + i * .18) + '><span>' + esc(r.nombre) + '</span><b>' + num(r.seguidores) + '</b>' + c + '</div>';
      }).join('') + '</div>' });
  }

  if (!cli && D.contactos) {
    var c = D.contactos;
    /* Cinco puestos fijos en dos alturas que se alternan (al azar se
       tapaban). Si escribieron más de cinco, la quinta burbuja dice "+N". */
    var puestos = [[0, 10], [19, 92], [38, 10], [57, 92], [76, 10]];
    var gente = c.personas.slice(0, c.n > 5 ? 4 : 5);
    if (c.n > 5) gente.push({ iniciales: '+' + (c.n - 4), nombre: 'y ' + (c.n - 4) + ' más', canal: '' });
    var bur = gente.map(function (p, i) {
      var t = [64, 58, 66, 56, 62][i];
      return '<span class="b' + (i % 3) + '" title="' + esc(p.nombre) + (p.canal ? ' · ' + esc(p.canal) : '') + '" style="--i:' + i + ';--x:' + puestos[i][0] + ';--y:' + puestos[i][1] + ';--t:' + t + 'px">' + esc(p.iniciales) + '</span>';
    }).join('');
    P.push({ id: 'contactos', tono: 'claro', html:
      eti('Contactos') +
      (c.n > 0
        ? '<div class="kvr-grande"' + a(.15) + '>' + num(c.n) + '<small>' + (c.n === 1 ? 'persona te escribió' : 'personas te escribieron') + '</small></div>' +
          (c.esperan ? '<span class="kvr-chip mal"' + a(.75) + '>' + c.esperan + (c.esperan === 1 ? ' espera' : ' esperan') + ' tu respuesta</span>' : '<span class="kvr-chip bien"' + a(.75) + '>' + ICO.chulo + ' Todos tienen respuesta</span>')
        : '<h2 class="kvr-titulo"' + a(.15) + '>Semana <em>tranquila.</em></h2><p class="kvr-texto"' + a(.4) + '>Nadie nuevo escribió. Buen momento para publicar algo y mover el formulario.</p>'),
      abajo: c.n > 0 ? '<div class="kvr-burbujas">' + bur + '</div>' : '' });
  }

  if (!cli && D.dinero && (D.dinero.semana > 0 || D.dinero.mes > 0 || D.dinero.por_cobrar > 0)) {
    var m = D.dinero;
    var confeti = '';
    if (m.semana > 0 && !quieto) {
      // Solo colores de la paleta, planos.
      var cols = ['#A580D6', '#7A3FC9', '#FBFBFB', '#4E1E86', '#DADADE'];
      for (var k = 0; k < 34; k++) confeti += '<i style="--x:' + (Math.random() * 100).toFixed(1) + ';--c:' + cols[k % cols.length] + ';--d:' + (Math.random() * .8).toFixed(2) + ';--t:' + (2.2 + Math.random() * 1.6).toFixed(2) + ';--r:' + Math.round(Math.random() * 540 - 270) + '"></i>';
    }
    P.push({ id: 'dinero', tono: 'oscuro', fondo: '<div class="kvr-confeti">' + confeti + '</div>', html:
      eti('Dinero') +
      /* Lo grande es lo que entró en la semana; si nada, lo del mes; y si
         tampoco, lo que está por cobrar: un "$0 entraron" no le sirve a nadie. */
      (m.semana > 0
        ? '<div class="kvr-grande"' + a(.15) + '>' + num(m.semana, 'plata') + '<small>entraron esta semana</small></div>'
        : m.mes > 0
          ? '<div class="kvr-grande"' + a(.15) + '>' + num(m.mes, 'plata') + '<small>entraron en ' + esc(m.mes_nombre) + '</small></div>'
          : '<div class="kvr-grande"' + a(.15) + '>' + num(m.por_cobrar, 'plata') + '<small>por cobrar</small></div><p class="kvr-texto"' + a(.6) + '>En ' + esc(m.mes_nombre) + ' todavía no entra nada: es buen momento para cobrar.</p>') +
      (m.semana > 0 && m.mes > m.semana ? '<p class="kvr-texto"' + a(.6) + '>En total, <b>' + plata(m.mes) + '</b> en ' + esc(m.mes_nombre) + '.</p>' : '') +
      (m.semana > 0 || m.mes > 0
        ? (m.por_cobrar > 0 ? '<p class="kvr-texto"' + a(.8) + '>Faltan por cobrar <b>' + plata(m.por_cobrar) + '</b>.</p>' : '<span class="kvr-chip bien"' + a(.8) + '>' + ICO.chulo + ' Nadie nos debe</span>')
        : '') });
  }

  /* El anillo: trazo plano, sin degradado. */
  var anilloDe = function (n) {
    return '<div class="kvr-anillo"' + a(.15) + '><svg viewBox="0 0 150 150" aria-hidden="true"><circle class="f" cx="75" cy="75" r="68"/><circle class="v" cx="75" cy="75" r="68" style="--off:' + (427 * (1 - n / 100)).toFixed(1) + '"/></svg><b>' + num(n) + '</b></div>';
  };
  var cifra = function (n, txt) { return '<div><b>' + num(n) + '</b><span>' + txt + '</span></div>'; };

  if (!cli && (D.trabajo || D.salud)) {
    var t = D.trabajo || { tareas: 0, hitos: 0, entregas: 0 };
    var s = D.salud;
    P.push({ id: 'logros', tono: 'violeta', html:
      eti('Lo que lograron') +
      (s ? anilloDe(s.indice) : '') +
      (s ? '<h2 class="kvr-titulo"' + a(.45) + '>Frente a ' + (s.total - 1) + ' estudios, <em>' + (s.puesto === 1 ? 'siguen de primeros.' : 'van en el puesto ' + s.puesto + '.º') + '</em></h2>' : ''),
      abajo: '<div class="kvr-cifras"' + a(.7) + '>' +
        cifra(t.tareas, t.tareas === 1 ? 'tarea hecha' : 'tareas hechas') +
        cifra(t.hitos, 'avances de proyecto') +
        cifra(t.entregas, t.entregas === 1 ? 'entrega' : 'entregas') +
      '</div>' });
  }

  /* ---- Las pantallas del cliente ---- */
  if (cli && D.salud) {
    var sc = D.salud;
    P.push({ tono: 'oscuro', html:
      eti('Salud de tu sitio') +
      anilloDe(sc.indice) +
      '<h2 class="kvr-titulo"' + a(.45) + '>' +
        (sc.cambio === null ? 'Tu sitio tiene <em>' + sc.indice + ' de 100 puntos.</em>'
          : sc.cambio > 0 ? 'Esta semana <em>subió ' + sc.cambio + (sc.cambio === 1 ? ' punto.' : ' puntos.') + '</em>'
          : sc.cambio < 0 ? 'Bajó ' + Math.abs(sc.cambio) + (sc.cambio === -1 ? ' punto:' : ' puntos:') + ' <em>ya lo estamos mirando.</em>'
          : 'Toda la semana <em>se mantuvo firme.</em>') + '</h2>',
      abajo: sc.pilares && sc.pilares.length
        ? '<div class="kvr-cifras kvr-cifras--4"' + a(.7) + '>' + sc.pilares.map(function (pl) { return cifra(pl.v, esc(pl.n)); }).join('') + '</div>'
        : '' });
  }
  if (cli && D.hecho && D.hecho.length) {
    P.push({ tono: 'violeta', html:
      eti('Lo que hicimos') +
      '<div class="kvr-grande"' + a(.15) + '>' + num(D.hecho.length) + '<small>' + (D.hecho.length === 1 ? 'avance esta semana' : 'avances esta semana') + '</small></div>',
      abajo: '<ul class="kvr-hoy kvr-hoy--hecho">' + D.hecho.slice(0, 5).map(function (t, i) {
        return '<li' + a(.5 + i * .12) + '><i>' + ICO.chulo + '</i><span>' + esc(t) + '</span></li>';
      }).join('') + '</ul>' });
  }
  var oculta = function (k) { return !!(D.tema && D.tema.ocultar && D.tema.ocultar.indexOf(k) >= 0); };
  var firma = function (d) { return '<p class="kvr-firma"' + a(d) + '>Hecho por <b>Kaiva Studio</b> · kaivastudio.com</p>'; };
  /* Sin "Lo que sigue" (lo decide cada cliente en su tema), la firma de Kaiva
     va al pie de la última pantalla, y al pasarla el Recap se cierra. */
  if (cli && oculta('sigue') && P.length) {
    P[P.length - 1].abajo = (P[P.length - 1].abajo || '') + firma(1);
  }
  if (cli && !oculta('sigue')) {
    P.push({ tono: 'claro', final: true, html:
      eti('Lo que sigue') +
      (D.sigue && D.sigue.length
        ? '<h2 class="kvr-titulo"' + a(.15) + '>En esto <em>seguimos.</em></h2><ul class="kvr-hoy">' + D.sigue.map(function (t, i) {
            return '<li' + a(.35 + i * .15) + '><i></i><span>' + esc(t) + '</span></li>';
          }).join('') + '</ul>'
        : '<h2 class="kvr-titulo"' + a(.15) + '>Todo <em>al día.</em></h2><p class="kvr-texto"' + a(.4) + '>No hay nada pendiente de nuestro lado.</p>'),
      abajo: firma(.7) +
        (D.autoabrir
          ? boton('Ver de nuevo', 'data-kvr-repetir', ICO.otraVez, .85)
          : boton('Cerrar', 'data-kvr-cerrar', '', .85)) });
  }

  if (!cli) P.push({ tono: 'claro', final: true, html:
    eti('Para hoy') +
    (D.pendientes && D.pendientes.length
      ? '<h2 class="kvr-titulo"' + a(.15) + '>Lo más <em>importante.</em></h2><ul class="kvr-hoy">' + D.pendientes.map(function (p, i) {
          return '<li class="' + (p.atrasado ? 'atrasado' : '') + '"' + a(.35 + i * .15) + '><i></i><span>' + esc(p.titulo) + '</span>' + (p.atrasado ? '<small>Atrasado</small>' : '') + '</li>';
        }).join('') + '</ul>'
      : '<h2 class="kvr-titulo"' + a(.15) + '>Todo <em>al día.</em></h2><p class="kvr-texto"' + a(.4) + '>No hay nada atrasado ni para hoy.</p>'),
    abajo: boton('Entrar al panel', 'data-kvr-cerrar', ICO.flecha, .7) });


  /* ---- LA VISTA PREVIA (2026-10-19): las pantallas más importantes, en
     pequeño, dentro de la tarjeta Recap de Inicio ([data-kvr-previa]). Son
     las MISMAS pantallas de la historia (mismo marcado, mismos estilos), ya
     en su estado final; tocarlas abre el Recap justo ahí. Lo que no cabe en
     la ficha se quita, de lo menos a lo más importante. */
  var previa = document.querySelector('[data-kvr-previa]');
  var ANCHO_P = 340;
  if (previa) {
    var quiero = (previa.getAttribute('data-kvr-previa') || 'google,visitas,contactos').split(',');
    var elegidas = [];
    quiero.concat(['dinero', 'logros', 'redes']).forEach(function (id) {
      P.forEach(function (p, i) { if (p.id === id && elegidas.indexOf(i) < 0 && elegidas.length < 3) elegidas.push(i); });
    });
    previa.classList.add('kvr', 'kvr--previa');
    previa.hidden = false;
    previa.innerHTML = elegidas.map(function (i) {
      var p = P[i];
      return '<button type="button" class="kvr-mini" data-t="' + p.tono + '" data-kvr-abrir data-kvr-ir="' + i + '" aria-label="Abrir el Recap en esta pantalla">' +
        '<span class="kvr-escala"><span class="kvr-p" data-t="' + p.tono + '"><span class="kvr-cuerpo">' + p.html + '</span><span class="kvr-hueco"></span>' +
        (p.abajo ? '<span class="kvr-abajo">' + p.abajo + '</span>' : '') + '</span></span></button>';
    }).join('');
    previa.querySelectorAll('[data-num]').forEach(function (el) {
      var fin = parseFloat(el.getAttribute('data-num')) || 0;
      el.innerHTML = (el.getAttribute('data-fmt') === 'plata' ? plata : miles)(fin);
    });
    var escalar = function () {
      // Si las tres quedan muy angostas (menos de 150 px), la tercera se quita.
      var movil = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
      previa.classList.toggle('dos', movil || previa.clientWidth < 3 * 150 + 24);
      previa.querySelectorAll('.kvr-mini').forEach(function (m) {
        var k = m.clientWidth / ANCHO_P;
        if (!k) return;
        var sec = m.querySelector('.kvr-p');
        m.style.setProperty('--k', k.toFixed(4));
        sec.style.height = (m.clientHeight / k) + 'px';
        // Lo que no cabe se quita: primero los textos largos, luego el chip, luego lo de abajo.
        var quitables = [].slice.call(sec.querySelectorAll('.kvr-texto'))
          .concat([].slice.call(sec.querySelectorAll('.kvr-chip')), [].slice.call(sec.querySelectorAll('.kvr-abajo')));
        quitables.forEach(function (x) { x.hidden = false; });
        for (var q = 0; q < quitables.length && sec.scrollHeight > sec.clientHeight + 1; q++) quitables[q].hidden = true;
      });
    };
    escalar();
    if (window.ResizeObserver) new ResizeObserver(escalar).observe(previa);
    else window.addEventListener('resize', escalar);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(escalar);
  }

  /* ---- El esqueleto ---- */
  var raiz = document.createElement('div');
  raiz.className = 'kvr';
  raiz.hidden = true;
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-label', 'Recap de la semana de ' + (cli ? D.marca : 'Kaiva Studio'));
  raiz.innerHTML =
    '<button type="button" class="kvr-paso kvr-paso--ant" data-kvr-ant aria-label="Pantalla anterior">' + ICO.izq + '</button>' +
    '<div class="kvr-tarjeta">' +
      '<div class="kvr-barras">' + P.map(function () { return '<span><b></b></span>'; }).join('') + '</div>' +
      '<div class="kvr-marca"><b>' + esc(cli ? D.corto : 'Kaiva') + '</b> Recap</div>' +
      '<button type="button" class="kvr-cerrar" aria-label="Cerrar" data-kvr-cerrar>' + ICO.cerrar + '</button>' +
      '<div class="kvr-pantallas">' + P.map(function (p) {
        return '<section class="kvr-p" data-t="' + p.tono + '">' + (p.fondo || '') +
          '<div class="kvr-cuerpo">' + p.html + '</div>' + '<div class="kvr-hueco"></div>' +
          (p.abajo ? '<div class="kvr-abajo">' + p.abajo + '</div>' : '') + '</section>';
      }).join('') + '</div>' +
      '<p class="kvr-pie">Toca para avanzar · mantén para pausar</p>' +
    '</div>' +
    '<button type="button" class="kvr-paso kvr-paso--sig" data-kvr-sig aria-label="Pantalla siguiente">' + ICO.der + '</button>';
  document.body.appendChild(raiz);

  /* La marca del cliente: sus colores y sus letras (src/temas-clientes.php).
     Sin tema, la piel de Kaiva que trae recap.css. */
  if (cli && D.tema) {
    var T = D.tema, mapa = { fondo: 'fondo', violeta: 'violeta', acento: 'acento', acento2: 'acento2', claro: 'claro',
      tinta: 'tinta', texto: 'fuente', titulos: 'titulos', em: 'em', em_estilo: 'em-estilo', mono: 'mono' };
    Object.keys(mapa).forEach(function (k) { if (T[k]) raiz.style.setProperty('--kvr-' + mapa[k], T[k]); });
    // Sus rellenos (la barra del mejor día, los chulos) van en su acento2.
    if (T.acento2) raiz.style.setProperty('--kvr-relleno', T.acento2);
    // Una letra de énfasis propia (la serif de Thallo) no aguanta el
    // interletrado apretado de Geist.
    if (T.em && T.em !== T.titulos) raiz.style.setProperty('--kvr-em-interletra', '-.01em');
    if (T.fuentes && !document.querySelector('link[data-kvr-fuentes]')) {
      var lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = T.fuentes; lk.setAttribute('data-kvr-fuentes', '');
      document.head.appendChild(lk);
    }
  }

  var tarjeta = raiz.querySelector('.kvr-tarjeta');
  var secciones = raiz.querySelectorAll('.kvr-p');
  var llenos = raiz.querySelectorAll('.kvr-barras b');
  var actual = -1, inicio = 0, transcurrido = 0, pausa = false, raf = null, focoPrevio = null;

  /* La curva de la casa, cubic-bezier(.2,.8,.2,1), para que el número y el
     anillo (que la usa en CSS) lleguen juntos y a la par. */
  var curva = (function (x1, y1, x2, y2) {
    var bx = function (t) { return 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t; };
    var by = function (t) { return 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t; };
    return function (x) {
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 24; i++) { var v = bx(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return by(t);
    };
  })(.2, .8, .2, 1);

  /* CONTAR. El número empieza cuando su bloque ya se ve (su --d), dura 1,6 s
     con la curva de la casa y termina quieto en su valor: sin salto ni
     destello al final. El anillo comparte duración, retraso y curva. */
  function contar(sec) {
    sec.querySelectorAll('[data-num]').forEach(function (el) {
      var fin = parseFloat(el.getAttribute('data-num')) || 0;
      var fmt = el.getAttribute('data-fmt') === 'plata' ? plata : miles;
      if (quieto) { el.innerHTML = fmt(fin); return; }
      var bloque = el.closest('[data-a]');
      var espera = (bloque ? parseFloat(bloque.style.getPropertyValue('--d')) || 0 : 0) * 1000 + 120;
      var anillo = el.closest('.kvr-anillo');
      if (anillo) {
        var trazo = anillo.querySelector('.v');
        trazo.style.transitionDuration = CUENTA + 'ms';
        trazo.style.transitionDelay = espera + 'ms';
      }
      var t0 = null;
      el.innerHTML = fmt(0);
      setTimeout(function () {
        function paso(tt) {
          if (!el.isConnected) return;
          if (t0 === null) t0 = tt;
          var x = Math.min(1, (tt - t0) / CUENTA);
          el.innerHTML = fmt(x === 1 ? fin : fin * curva(x));
          if (x < 1) requestAnimationFrame(paso);
        }
        requestAnimationFrame(paso);
      }, espera);
    });
  }

  function ir(i) {
    if (i < 0) i = 0;
    if (i >= P.length) { cerrar(); return; }
    // La pantalla que se va SALE (más rápido que lo que entra, hacia el lado
    // contrario al avance) en vez de desaparecer de golpe.
    raiz.setAttribute('data-dir', i < actual ? '-1' : '1');
    if (actual >= 0 && actual !== i) {
      var vieja = secciones[actual];
      vieja.classList.remove('on');
      vieja.classList.add('sale');
      setTimeout(function () { vieja.classList.remove('sale'); }, 320);
    }
    actual = i;
    // Reinicia las animaciones de la pantalla: volver a ella las repite.
    var sec = secciones[i];
    var copia = sec.cloneNode(true);
    sec.parentNode.replaceChild(copia, sec);
    secciones = raiz.querySelectorAll('.kvr-p');
    void copia.offsetWidth;
    copia.classList.add('on');
    raiz.setAttribute('data-tono', P[i].tono);
    raiz.classList.toggle('primera', i === 0);
    llenos.forEach(function (b, k) { b.style.transform = 'scaleX(' + (k < i ? 1 : 0) + ')'; });
    // Si no queda aire para el dibujo (pantalla baja, mucho texto), no va:
    // encogido o encima del texto se vería como un error.
    var hueco = copia.querySelector('.kvr-hueco');
    if (hueco) hueco.classList.toggle('chico', hueco.clientHeight < 96);
    contar(copia);
    transcurrido = 0; inicio = performance.now();
  }

  function tic(t) {
    if (!pausa && actual >= 0 && !P[actual].final) {
      transcurrido += t - inicio;
      llenos[actual].style.transform = 'scaleX(' + Math.min(1, transcurrido / DURA) + ')';
      if (transcurrido >= DURA) { ir(actual + 1); }
    } else if (actual >= 0 && P[actual].final) {
      llenos[actual].style.transform = 'scaleX(1)';
    }
    inicio = t;
    raf = requestAnimationFrame(tic);
  }

  function abrir(desde) {
    focoPrevio = document.activeElement;
    raiz.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () { raiz.classList.add('abierto'); });
    actual = -1;
    ir(typeof desde === 'number' ? desde : 0);
    inicio = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tic);
    raiz.querySelector('.kvr-cerrar').focus({ preventScroll: true });
    if (!cli) { try { localStorage.setItem('kvRecap', hoyClave()); } catch (e) {} }
  }

  function cerrar() {
    raiz.classList.add('cerrando');
    raiz.classList.remove('abierto');
    cancelAnimationFrame(raf);
    document.documentElement.style.overflow = '';
    setTimeout(function () { raiz.hidden = true; raiz.classList.remove('cerrando'); if (actual >= 0) secciones[actual].classList.remove('on'); actual = -1; }, 280);
    if (focoPrevio && focoPrevio.focus) focoPrevio.focus({ preventScroll: true });
  }

  function hoyClave() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  /* ---- Gestos ---- */
  var apretado = null;
  tarjeta.addEventListener('pointerdown', function (e) {
    if (e.target.closest('[data-kvr-cerrar],[data-kvr-repetir]')) return;
    apretado = { t: performance.now(), x: e.clientX };
    pausa = true;
    tarjeta.classList.add('apretada');       // la tarjeta cede un poco al dedo
  });
  tarjeta.addEventListener('pointerup', function (e) {
    if (!apretado) return;
    var largo = performance.now() - apretado.t > 350;
    var r = tarjeta.getBoundingClientRect();
    var izq = apretado.x - r.left < r.width * 0.3;
    apretado = null; pausa = false;
    tarjeta.classList.remove('apretada');
    if (largo) return;                 // fue una pausa, no un toque
    ir(izq ? actual - 1 : actual + 1);
  });
  tarjeta.addEventListener('pointerleave', function () { apretado = null; pausa = false; tarjeta.classList.remove('apretada'); });
  raiz.addEventListener('click', function (e) {
    if (e.target.closest('[data-kvr-cerrar]')) { e.stopPropagation(); cerrar(); return; }
    if (e.target.closest('[data-kvr-repetir]')) { e.stopPropagation(); ir(0); return; }
    if (e.target.closest('[data-kvr-ant]')) { ir(actual - 1); return; }
    if (e.target.closest('[data-kvr-sig]')) { ir(actual + 1); return; }
    if (e.target === raiz) cerrar();
  });
  document.addEventListener('keydown', function (e) {
    if (raiz.hidden) return;
    if (e.key === 'Escape') cerrar();
    else if (e.key === 'ArrowRight') ir(actual + 1);
    else if (e.key === 'ArrowLeft') ir(actual - 1);
    else if (e.key === ' ') { e.preventDefault(); pausa = !pausa; }
  });
  document.addEventListener('visibilitychange', function () { pausa = document.hidden; });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-kvr-abrir]');
    if (!b) return;
    abrir(parseInt(b.getAttribute('data-kvr-ir'), 10) || 0);
  });
  window.kvRecapAbrir = abrir;

  /* La de Kaiva se abre sola la primera vez de cada día; la de un cliente,
     solo en su enlace privado (D.autoabrir) o con el botón. */
  var forzar = /[?&]recap=1/.test(location.search);
  var visto = null;
  try { visto = localStorage.getItem('kvRecap'); } catch (e) {}
  if (cli ? (D.autoabrir || forzar) : (forzar || visto !== hoyClave())) setTimeout(abrir, 450);
})();
