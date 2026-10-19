/* ============================================================================
   KAIVA OS — lo que se mueve (pedido del 2026-10-19: «utiliza esas cosas que
   tenemos en la página web»). Las mismas reglas que kaivastudio.com
   (REGLAS-KAIVA §7):
     · Las cifras cuentan al llegar, una tras otra (180 ms entre tarjetas), y
       vuelven a contar al tocarlas. Sin salto ni destello al terminar.
     · Las barras se encienden en morado al pasar el mouse y, al hundirlas,
       se vuelven a llenar.
     · Las listas largas no estiran la página: se ven de a tres con flechas
       abajo ([data-paginas="3"]), y se pasa ahí mismo, sin ir a otra pantalla.
   Todo respeta prefers-reduced-motion y funciona sin este guion (sin él, las
   listas se ven completas y las cifras quietas).
   ============================================================================ */
(function () {
  var quieto = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- listas */
  var flecha = function (d) {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  };
  document.querySelectorAll('[data-paginas]').forEach(function (lista) {
    var n = parseInt(lista.getAttribute('data-paginas'), 10) || 3;
    var items = Array.prototype.filter.call(lista.children, function (c) { return !c.hasAttribute('data-no-pagina'); });
    if (items.length <= n) return;
    var total = Math.ceil(items.length / n), actual = 0;
    var pie = document.createElement('div');
    pie.className = 'k-pasar';
    pie.innerHTML = '<span class="k-pasar-n" aria-live="polite"></span><span class="k-pasar-puntos" aria-hidden="true"></span>'
      + '<button type="button" class="k-circ k-circ--chico" data-ir="-1" aria-label="Anteriores">' + flecha('M15 6l-6 6 6 6') + '</button>'
      + '<button type="button" class="k-circ k-circ--chico" data-ir="1" aria-label="Siguientes">' + flecha('M9 6l6 6-6 6') + '</button>';
    var puntos = pie.querySelector('.k-pasar-puntos');
    for (var i = 0; i < total; i++) puntos.appendChild(document.createElement('i'));
    lista.after(pie);
    lista.classList.add('k-paginada');

    function ver(p, dir) {
      actual = (p + total) % total;
      items.forEach(function (it, k) {
        var ve = Math.floor(k / n) === actual;
        it.hidden = !ve;
        if (ve && dir && !quieto) {
          it.classList.remove('k-entra-izq', 'k-entra-der');
          void it.offsetWidth;
          it.classList.add(dir > 0 ? 'k-entra-der' : 'k-entra-izq');
        }
      });
      pie.querySelector('.k-pasar-n').textContent = (actual + 1) + ' de ' + total;
      Array.prototype.forEach.call(puntos.children, function (pt, k) { pt.className = k === actual ? 'on' : ''; });
    }
    /* La tarjeta no cambia de tamaño al pasar de página (regla de la casa):
       la lista reserva el alto de su página más alta, medido al cargar y
       cada vez que cambia el ancho. */
    function fijarAlto() {
      lista.style.minHeight = '';
      var antes = actual, alto = 0;
      for (var p = 0; p < total; p++) {
        items.forEach(function (it, k) { it.hidden = Math.floor(k / n) !== p; });
        alto = Math.max(alto, lista.offsetHeight);
      }
      items.forEach(function (it, k) { it.hidden = Math.floor(k / n) !== antes; });
      lista.style.minHeight = alto + 'px';
    }
    var tAncho = null, anchoAntes = lista.offsetWidth;
    window.addEventListener('resize', function () {
      if (lista.offsetWidth === anchoAntes) return;
      anchoAntes = lista.offsetWidth;
      clearTimeout(tAncho);
      tAncho = setTimeout(fijarAlto, 150);
    });
    pie.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ir]');
      if (b) ver(actual + parseInt(b.getAttribute('data-ir'), 10), parseInt(b.getAttribute('data-ir'), 10));
    });
    // En el celular, también deslizando el dedo sobre la lista.
    var x0 = null;
    lista.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lista.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) ver(actual + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      x0 = null;
    });
    ver(0, 0);
    fijarAlto();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fijarAlto);
  });

  /* --------------------------------------------------------------- cifras */
  var SEL_CIFRAS = '.k-cifra, .k-v-inicio .k-ficha b, .k-aro > span, .k-anillo b, [data-cuenta-sube]';
  function preparar(el) {
    if (el._kc) return el._kc;
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodo, m;
    while ((nodo = w.nextNode())) {
      m = nodo.nodeValue.match(/\d[\d.]*(,\d+)?/);
      if (m) break;
    }
    if (!nodo || !m) return (el._kc = null);
    var txt = m[0];
    var dec = m[1] ? m[1].length - 1 : 0;
    var miles = /\d\.\d{3}/.test(txt);
    var valor = parseFloat(txt.replace(/\./g, '').replace(',', '.'));
    if (!isFinite(valor) || valor === 0) return (el._kc = null);
    return (el._kc = { nodo: nodo, antes: nodo.nodeValue.slice(0, m.index), despues: nodo.nodeValue.slice(m.index + txt.length), valor: valor, dec: dec, miles: miles });
  }
  function formato(v, c) {
    var s = v.toFixed(c.dec).split('.');
    var ent = c.miles ? s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') : s[0];
    return ent + (c.dec ? ',' + s[1] : '');
  }
  function contar(el, retraso) {
    var c = preparar(el);
    if (!c || quieto) return;
    cancelAnimationFrame(el._kr);
    clearTimeout(el._kt);
    c.nodo.nodeValue = c.antes + formato(0, c) + c.despues;
    // El dinero cuenta más despacio, al paso de sus tallos.
    var dur = el.closest('.k-tallos') ? 1900 : 1600;
    el._kt = setTimeout(function () {
      var t0 = performance.now();
      (function paso(t) {
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        c.nodo.nodeValue = c.antes + formato(c.valor * e, c) + c.despues;
        if (k < 1) el._kr = requestAnimationFrame(paso);
      })(t0);
    }, retraso || 0);
  }
  var cifras = Array.prototype.slice.call(document.querySelectorAll(SEL_CIFRAS));
  if ('IntersectionObserver' in window) {
    var orden = 0, tanda = null;
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        contar(en.target, (orden++) * 180);
        clearTimeout(tanda);
        tanda = setTimeout(function () { orden = 0; }, 400);
      });
    }, { threshold: 0.4 });
    cifras.forEach(function (c) { io.observe(c); });
  }
  // Vuelven a contar al tocarlas (lo que no lleva a otra página).
  document.addEventListener('click', function (e) {
    if (e.target.closest('a, button, select, input, label, summary')) return;
    var caja = e.target.closest('.k-t, .k-ficha, .k-aros, .k-anillo');
    if (!caja) return;
    caja.querySelectorAll(SEL_CIFRAS).forEach(function (c, k) { contar(c, k * 120); });
  });

  /* --------------------------------------------------------------- barras */
  // Al hundir una barra (o un aro, o una gráfica), se vuelve a llenar.
  var SEL_LLENA = '.k-barra, .k-anillo, .k-aros, .k-tallos, .k-barras, .k-meses, .os-grafica, .k-spark';
  document.addEventListener('pointerdown', function (e) {
    if (quieto) return;
    var b = e.target.closest(SEL_LLENA);
    if (!b || !b.getAnimations) return;
    b.getAnimations({ subtree: true }).forEach(function (a) { a.cancel(); a.play(); });
  });

  /* ------------------------------------- tarjetas con vistas que no saltan
     Una tarjeta que cambia de vista por dentro (Pendientes/Hechos, los filtros
     de Movimientos…) reserva el alto de su vista más alta: cambiar de vista
     no la encoge ni la estira (regla de la casa). */
  function fijarVistas(caja) {
    var panelesMios = Array.prototype.filter.call(caja.querySelectorAll('[data-vista-panel]'), function (p) { return p.closest('[data-vistas]') === caja; });
    var vistas = [];
    Array.prototype.forEach.call(caja.querySelectorAll('a[data-vista]'), function (a) {
      if (a.closest('[data-vistas]') === caja && vistas.indexOf(a.getAttribute('data-vista')) < 0) vistas.push(a.getAttribute('data-vista'));
    });
    if (vistas.length < 2 || !panelesMios.length) return;
    caja.style.minHeight = '';
    var antes = panelesMios.map(function (p) { return p.hidden; }), alto = 0;
    vistas.forEach(function (v) {
      panelesMios.forEach(function (p) { p.hidden = p.getAttribute('data-vista-panel').split(' ').indexOf(v) < 0; });
      alto = Math.max(alto, caja.offsetHeight);
    });
    panelesMios.forEach(function (p, k) { p.hidden = antes[k]; });
    caja.style.minHeight = alto + 'px';
  }
  var cajasVistas = Array.prototype.filter.call(document.querySelectorAll('.k-t[data-vistas]'), function (c) { return !c.closest('[hidden]'); });
  cajasVistas.forEach(fijarVistas);
  // Las que estaban escondidas al cargar (p. ej. Dinero dentro de Ventas) se
  // miden la primera vez que aparecen.
  document.addEventListener('click', function (e) {
    if (!e.target.closest('a[data-vista]')) return;
    setTimeout(function () {
      document.querySelectorAll('.k-t[data-vistas]').forEach(function (c) {
        if (!c.style.minHeight && c.offsetHeight) fijarVistas(c);
      });
    }, 0);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { cajasVistas.forEach(fijarVistas); });

  /* ------------------------------------------------- la tira de días (Inicio)
     Tocar un día deja en la agenda solo lo de ese día (o los atrasados);
     tocarlo otra vez lo muestra todo. La tarjeta no cambia de alto: la lista
     se desplaza por dentro. */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-dia-filtro]');
    if (!b) return;
    var agenda = b.closest('.k-agenda');
    if (!agenda) return;
    var activo = b.getAttribute('aria-pressed') === 'true';
    agenda.querySelectorAll('[data-dia-filtro]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
    var f = activo ? '' : b.getAttribute('data-dia-filtro');
    if (f) b.setAttribute('aria-pressed', 'true');
    var panel = agenda.querySelector('[data-vista-panel="pendientes"].k-panel');
    if (!panel) return;
    var n = 0;
    panel.querySelectorAll('.k-fila').forEach(function (fila) {
      var ve = !f || (f === 'vencidas' ? fila.getAttribute('data-grupo') === 'vencidas' : fila.getAttribute('data-dia') === f);
      fila.hidden = !ve;
      if (ve) n++;
    });
    panel.querySelectorAll('.k-grupo').forEach(function (g) { g.hidden = !g.querySelector('.k-fila:not([hidden])'); });
    var rec = panel.querySelector('.k-recuerda');
    if (rec) rec.hidden = !!f;
    var vacio = panel.querySelector('.k-dia-vacio');
    if (vacio) vacio.hidden = !f || n > 0;
    var caja = agenda.querySelector('.k-scroll');
    if (caja) caja.scrollTop = 0;
  });
})();
