/* Guion del panel. Antes vivía dentro de public/pro/index.php y viajaba
   (43 KB) en cada clic; aquí el navegador lo guarda. KV_DOMINIO lo declara
   index.php justo antes de cargar este archivo. Si cambias algo, sube el ?v=. */
    /* ======================================================================
       EL ANÁLISIS Y SU ESPERA
       ======================================================================
       La versión anterior está descrita entera en el comentario del CSS de
       .scanner-overlay: sin salida, con una barra que inventaba etapas y con
       los errores en alert(). Aquí van las decisiones del guion.

       LOS DOS TOPES SON DISTINTOS PORQUE LAS DOS PETICIONES LO SON. scan.php
       responde en unos 2s y speed.php en unos 20s medidos contra producción,
       porque el segundo espera a PageSpeed. 90s y 120s dejan margen de sobra
       para una red mala sin llegar a la espera anterior, que era literalmente
       infinita: sin AbortController y sin timeout, un socket colgado dejaba el
       overlay puesto hasta que la persona recargara la página.

       LAS FASES QUE SE ANUNCIAN SON LAS QUE EXISTEN. Son dos peticiones, así
       que son dos pasos y no cuatro. Lo demás que se puede decir con verdad es
       cuánto lleva esperando, y por eso hay un contador de segundos en vez de
       un porcentaje.

       EL SEGUNDO PASO NO PUEDE FALLAR LA PANTALLA. Cuando scan.php responde,
       la medición YA ESTÁ GUARDADA; PageSpeed solo mueve el pilar de Imagen.
       Si esa segunda petición se cae o se pasa de tiempo, se dice y se recarga
       igual, porque lo que hay que enseñar ya existe. Es el mismo criterio que
       el diagnóstico gratis aplica en su catch. */
    (function () {
      var TOPE_ANALISIS = 90000;
      var TOPE_VELOCIDAD = 120000;

      var overlay = document.getElementById('scannerOverlay');
      var titulo = document.getElementById('scanTitle');
      var linea = document.getElementById('scanStatus');
      var barra = document.getElementById('scanBarra');
      var fallo = document.getElementById('scanFallo');
      var falloTxt = document.getElementById('scanFalloTxt');
      var btnCancelar = document.getElementById('scanCancelar');
      var btnReintentar = document.getElementById('scanReintentar');
      var btnCerrar = document.getElementById('scanCerrar');
      var shell = document.querySelector('.tool-shell');

      /* Si el marcado del overlay no está, la función sigue existiendo pero no
         hace nada: es preferible a que un onclick del HTML reviente con
         "ejecutarAnalisis is not defined" y se lleve por delante el resto del
         guion de la página. */
      if (!overlay || !linea || !fallo || !btnCancelar) {
        window.ejecutarAnalisis = function () {};
        return;
      }

      var ctrl = null;         // el AbortController de la petición en curso
      var motivo = '';         // 'cancelado' | 'tiempo' — por qué se abortó
      var reloj = null;        // el intervalo del contador de segundos
      var vence = null;        // el temporizador del tope de la petición
      var segundos = 0;
      var paso = '';
      var activo = false;      // ¿sigue puesta ESTA espera?
      var focoPrevio = null;
      var dominioActual = '';

      function pintar() {
        linea.textContent = paso + ' · ' + segundos + ' s';
      }

      function arrancarReloj(texto) {
        paso = texto;
        segundos = 0;
        pintar();
        pararReloj();
        reloj = setInterval(function () { segundos++; pintar(); }, 1000);
      }

      function pararReloj() {
        if (reloj) { clearInterval(reloj); reloj = null; }
      }

      function abrir(dom) {
        focoPrevio = document.activeElement;
        dominioActual = dom;
        activo = true;

        titulo.textContent = dom ? 'Analizando ' + dom : 'No pudimos empezar el análisis';
        fallo.hidden = true;
        barra.hidden = false;
        linea.hidden = false;
        btnCancelar.hidden = false;
        overlay.hidden = false;

        document.body.classList.add('kv-sin-scroll');
        if (shell) { shell.setAttribute('inert', ''); }

        /* El foco se va al overlay. Antes se quedaba en el botón que acababa
           de quedar tapado, así que un Enter de más lanzaba OTRO análisis
           encima del que ya estaba corriendo. */
        overlay.focus();
      }

      function cerrar() {
        activo = false;
        pararReloj();
        if (vence) { clearTimeout(vence); vence = null; }

        overlay.hidden = true;
        document.body.classList.remove('kv-sin-scroll');
        if (shell) { shell.removeAttribute('inert'); }

        /* EL FOCO VUELVE DE DONDE SALIÓ. Y se suelta ANTES, siempre: al
           cerrar, el foco está en Cancelar o en Reintentar, que acaban de
           quedar dentro de un elemento `hidden`. Medido en el navegador: si
           quien abrió el overlay no era enfocable —pasa si el análisis se
           dispara desde algo que no es un botón—, `focoPrevio.focus()` no hace
           nada y el foco se queda clavado en un control invisible, con Tab
           empezando desde la nada. Soltarlo primero deja el peor caso en
           "vuelve al principio del documento", que es recuperable. */
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        if (focoPrevio && focoPrevio !== document.body
            && document.contains(focoPrevio) && typeof focoPrevio.focus === 'function') {
          focoPrevio.focus();
        }
        focoPrevio = null;
      }

      function fallar(texto) {
        pararReloj();
        barra.hidden = true;
        linea.hidden = true;
        btnCancelar.hidden = true;
        falloTxt.textContent = texto;
        fallo.hidden = false;
        btnReintentar.focus();
      }

      function terminar(nota) {
        pararReloj();
        btnCancelar.hidden = true;
        linea.textContent = nota || 'Listo. Abriendo el panel con la medición nueva.';
        setTimeout(function () { location.reload(); }, nota ? 2200 : 700);
      }

      function cancelar() {
        motivo = 'cancelado';
        if (ctrl) { ctrl.abort(); }
        cerrar();
      }

      function pedir(ruta, cuerpo, tope) {
        ctrl = new AbortController();
        motivo = '';
        vence = setTimeout(function () { motivo = 'tiempo'; ctrl.abort(); }, tope);

        return fetch(ruta, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
          signal: ctrl.signal
        }).then(function (r) {
          clearTimeout(vence); vence = null;
          /* Un 500 devuelve HTML, no JSON, y r.json() revienta con un
             SyntaxError que no le dice nada a nadie. El código HTTP sí. */
          return r.json().catch(function () {
            var e = new Error('El servidor respondió algo que no pudimos leer (código ' + r.status + ').');
            e.codigo = 'respuesta_ilegible';
            throw e;
          });
        }, function (e) {
          clearTimeout(vence); vence = null;
          throw e;
        });
      }

      /* Los mismos cuatro motivos que distingue el diagnóstico gratis, más el
         del tope de tiempo, que allí no existe porque allí no hay overlay que
         cerrar. Cada uno lleva la acción de quien lo lee: esperar, revisar la
         dirección, revisar su conexión o volver a intentar. */
      function explicar(err) {
        if (motivo === 'tiempo') {
          return 'El análisis pasó de ' + Math.round(TOPE_ANALISIS / 1000) + ' segundos sin responder. '
            + 'Puede que ' + (dominioActual || 'el sitio') + ' esté lento o que nuestro servidor esté ocupado. '
            + 'Vuelve a intentarlo en un momento.';
        }
        if (err && err.codigo === 'rate_limited') {
          return 'Has hecho varios análisis seguidos. Espera unos minutos y vuelve a intentarlo.';
        }
        if (err && (err.codigo === 'unreachable' || /no responde|inaccesible/i.test(err.message || ''))) {
          return 'No pudimos conectarnos a ' + (dominioActual || 'tu sitio') + '. '
            + 'Revisa que la dirección esté bien escrita y que el sitio esté en línea.';
        }
        if (err instanceof TypeError) {
          // fetch lanza TypeError cuando no hubo respuesta ninguna: sin
          // internet, DNS caído o el servidor abajo.
          return 'No pudimos conectar con nuestro servidor. Revisa tu conexión e inténtalo de nuevo.';
        }
        return (err && err.message) || 'No pudimos completar el análisis. Inténtalo de nuevo en un momento.';
      }

      function correr(dom) {
        abrir(dom);
        arrancarReloj('Paso 1 de 2 · Revisando el sitio');

        pedir('/api/scan.php', { url: dom }, TOPE_ANALISIS)
          .then(function (scan) {
            if (!activo) { return; }
            if (!scan.ok) {
              var e = new Error(scan.error || 'no se pudo analizar');
              e.codigo = scan.code || '';
              throw e;
            }

            arrancarReloj('Paso 2 de 2 · Midiendo la velocidad con PageSpeed');

            return pedir('/api/speed.php', { scan_id: scan.scan_id }, TOPE_VELOCIDAD)
              .then(function () {
                if (activo) { terminar(''); }
              }, function () {
                if (!activo) { return; }
                if (motivo === 'cancelado') { cerrar(); return; }
                terminar('La velocidad no se pudo medir. El resto del análisis quedó guardado.');
              });
          })
          .catch(function (err) {
            if (!activo) { return; }
            if (motivo === 'cancelado') { cerrar(); return; }
            console.error('[kaiva] análisis:', err);
            fallar(explicar(err));
          });
      }

      btnCancelar.addEventListener('click', cancelar);
      if (btnCerrar) { btnCerrar.addEventListener('click', cerrar); }
      if (btnReintentar) {
        btnReintentar.addEventListener('click', function () { correr(dominioActual); });
      }

      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (fallo.hidden) { cancelar(); } else { cerrar(); }
          return;
        }
        if (e.key !== 'Tab') { return; }

        /* El overlay tapa la pantalla entera y el panel de detrás está inert,
           así que el Tab no tiene a dónde ir: se cicla entre los botones que
           estén a la vista en este momento (Cancelar, o Reintentar/Cerrar). */
        var focos = [].slice.call(overlay.querySelectorAll('button')).filter(function (b) {
          return b.offsetParent !== null;
        });
        if (!focos.length) { return; }

        var primero = focos[0];
        var ultimo = focos[focos.length - 1];
        if (e.shiftKey && (document.activeElement === primero || document.activeElement === overlay)) {
          e.preventDefault(); ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault(); primero.focus();
        }
      });

      window.ejecutarAnalisis = function (url) {
        if (activo) { return; }   // ya hay uno corriendo
        var dom = String(url || KV_DOMINIO || '').trim();
        if (!dom) {
          /* Caso vacío: sin dominio no hay nada que medir, y se dice en el
             mismo sitio donde se dice todo lo demás. */
          abrir('');
          fallar('No sabemos qué sitio analizar. Vuelve a entrar al panel desde tu dominio.');
          return;
        }
        correr(dom);
      };
    })();

    /* ---- Llegar a un hallazgo desde "la siguiente decisión" ---------------
       El enlace del Resumen trae el ancla del hallazgo. Un <details> cerrado
       hace que el salto termine en una fila plegada, que se lee exactamente
       igual que si el enlace no hubiera hecho nada. */
    (function () {
      function abrirDelHash() {
        var id = (location.hash || '').replace('#', '');
        if (!id) { return; }
        var el = document.getElementById(id);
        if (!el || el.tagName.toLowerCase() !== 'details') { return; }
        el.open = true;
        el.setAttribute('tabindex', '-1');
        el.scrollIntoView({ block: 'start' });
        el.focus();
      }
      abrirDelHash();
      window.addEventListener('hashchange', abrirDelHash);
    })();

    /* ---- Filtrar los hallazgos por nivel ----------------------------------
       En el cliente y sobre lo que ya está pintado: no recarga la página ni
       pide nada. Con doce hallazgos la lista es un muro y no había forma de ir
       a lo grave sin recorrerla entera.

       Tres cosas que no son obvias:

       · Al filtrar se CIERRAN los que quedan visibles y se abre el primero.
         Sin eso, si venías con el cuarto abierto y filtras a "críticos", te
         quedaba una ficha abierta en medio de una lista de una sola entrada.
       · El estado se anuncia con `aria-pressed`, no solo con color.
       · Si un filtro deja la lista vacía se dice, en vez de enseñar una
         tarjeta en blanco. No debería pasar —los chips con cero están
         deshabilitados— pero un estado vacío que "no debería pasar" es
         justamente el que nadie escribe y luego aparece. */
    (function () {
      var chips = Array.prototype.slice.call(document.querySelectorAll('.fil-chip'));
      if (!chips.length) { return; }
      var fichas = Array.prototype.slice.call(document.querySelectorAll('.finds .find'));
      var vacio  = document.getElementById('filVacio');

      function aplicar(nivel) {
        var visibles = 0;
        fichas.forEach(function (f) {
          var pasa = (nivel === 'todos') || (f.getAttribute('data-sev') === nivel);
          f.hidden = !pasa;
          f.open = false;
          if (pasa) { visibles++; }
        });

        var primera = fichas.filter(function (f) { return !f.hidden; })[0];
        if (primera) { primera.open = true; }

        chips.forEach(function (c) {
          c.setAttribute('aria-pressed', c.getAttribute('data-nivel') === nivel ? 'true' : 'false');
        });

        if (vacio) {
          vacio.style.display = visibles ? 'none' : 'block';
          vacio.textContent = visibles ? '' : 'Ningún hallazgo de ese nivel en esta medición.';
        }
      }

      chips.forEach(function (c) {
        c.addEventListener('click', function () {
          if (c.disabled) { return; }
          aplicar(c.getAttribute('data-nivel') || 'todos');
        });
      });
    })();

    /* ---- Copiar: el hallazgo, y el enlace del informe ---------------------
       Ver la nota de .fb-copiar en el CSS y kaiva_hallazgo_texto() en el PHP.
       Aquí solo está el orden de los tres caminos, y va del peor al mejor a
       propósito, que es como se escriben los estados:

         · No hay portapapeles (http sin TLS, navegador embebido de una app) →
           se cae al textarea + execCommand, que sigue funcionando ahí.
         · Tampoco eso → se dice "No se pudo copiar" y se deja el texto
           seleccionado para hacerlo a mano. Nunca un botón mudo.
         · Sí hay → "Copiado".

       La confirmación cambia la PALABRA, no solo el color, y además se
       anuncia por #kvAnuncio para quien no está mirando el botón. */
    (function () {
      var botones = [].slice.call(document.querySelectorAll('.fb-copiar'));
      if (!botones.length) { return; }
      var anuncio = document.getElementById('kvAnuncio');

      function anunciar(txt) {
        if (anuncio) { anuncio.textContent = txt; }
      }

      function copiarAMano(texto) {
        var ta = document.createElement('textarea');
        ta.value = texto;
        ta.setAttribute('readonly', '');
        ta.className = 'kv-copia-oculta';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        return ok;
      }

      botones.forEach(function (b) {
        var etq = b.querySelector('.fb-copiar-txt');
        var base = b.getAttribute('data-etq') || 'Copiar';
        var exito = b.getAttribute('data-ok') || 'Copiado';
        var vuelta = null;

        function marcar(estado, texto, anuncioTxt) {
          b.setAttribute('data-estado', estado);
          if (etq) { etq.textContent = texto; }
          anunciar(anuncioTxt);
          if (vuelta) { clearTimeout(vuelta); }
          vuelta = setTimeout(function () {
            b.removeAttribute('data-estado');
            if (etq) { etq.textContent = base; }
          }, estado === 'ok' ? 2200 : 4000);
        }

        b.addEventListener('click', function () {
          var texto = b.getAttribute('data-copia') || '';
          if (!texto) {
            marcar('fallo', 'No hay nada que copiar', 'No hay nada que copiar.');
            return;
          }

          var bien = function () { marcar('ok', exito, exito + '.'); };
          var mal = function () {
            if (copiarAMano(texto)) { bien(); return; }
            marcar('fallo', 'No se pudo copiar', 'No se pudo copiar. Selecciona el texto del hallazgo y cópialo a mano.');
          };

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).then(bien, mal);
          } else {
            mal();
          }
        });
      });
    })();

    function cambiarVistaGrafica(tipo) {
      const gLinea = document.getElementById('graficaLinea');
      const gBarras = document.getElementById('graficaBarras');
      const btnLinea = document.getElementById('btnGraficaLinea');
      const btnBarras = document.getElementById('btnGraficaBarras');
      
      const esLinea = tipo === 'linea';
      if (gLinea) gLinea.style.display = esLinea ? 'block' : 'none';
      if (gBarras) gBarras.style.display = esLinea ? 'none' : 'block';

      // El aspecto lo decide la hoja de estilos a partir de aria-pressed. Antes
      // eran ocho asignaciones de estilo en linea por rama, duplicadas: cambiar
      // un color obligaba a tocarlo en cuatro sitios y a acordarse del cuarto.
      if (btnLinea) btnLinea.setAttribute('aria-pressed', String(esLinea));
      if (btnBarras) btnBarras.setAttribute('aria-pressed', String(!esLinea));
    }

    /* Los dos menus de la barra: dominio y cuenta. Un solo manejador para los
       dos, porque se comportan igual —abren, cierran al pulsar fuera, cierran
       con Escape y devuelven el foco—. Escribirlo dos veces seria la forma de
       que uno de los dos se quede sin el Escape. */
    (function () {
      var menus = [
        { boton: 'domBtn', caja: 'domMenu' },
        { boton: 'cuentaBtn', caja: 'cuentaMenu' }
      ].map(function (m) {
        return { b: document.getElementById(m.boton), c: document.getElementById(m.caja) };
      }).filter(function (m) { return m.b && m.c; });

      function cerrarTodos(excepto) {
        menus.forEach(function (m) {
          if (m === excepto) return;
          m.c.hidden = true;
          m.b.setAttribute('aria-expanded', 'false');
        });
      }

      menus.forEach(function (m) {
        m.b.addEventListener('click', function (e) {
          e.stopPropagation();
          if (m.b.disabled) return;
          var abierto = !m.c.hidden;
          cerrarTodos(m);
          m.c.hidden = abierto;
          m.b.setAttribute('aria-expanded', String(!abierto));
        });
        m.c.addEventListener('click', function (e) { e.stopPropagation(); });
      });

      document.addEventListener('click', function () { cerrarTodos(); });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var abierto = menus.filter(function (m) { return !m.c.hidden; })[0];
        if (!abierto) return;
        cerrarTodos();
        abierto.b.focus();
      });
    })();

    /* Campo de busquedas objetivo. El <textarea> real queda oculto y es lo que
       viaja al servidor; lo de arriba es solo la forma de llenarlo. Si el
       JavaScript no corre, el textarea se queda visible y el formulario
       funciona como siempre: por eso se oculta DESDE AQUI y no en la hoja de
       estilos. */
    (function () {
      var form = document.getElementById('objForm');
      if (!form) return;
      /* Aqui habia tambien un 'vacio' (el renglon "Escribe una y pulsa
         Enter."). Ese elemento ya no existe en el HTML, asi que la variable y
         su vacio.hidden se quitaron: dejarlas habria dado un TypeError al
         primer pintado y habria tumbado todo este bloque. */
      var entrada = document.getElementById('objEntrada'),
          oculto  = document.getElementById('objOculto'),
          caja    = document.getElementById('objEtiquetas'),
          btn     = document.getElementById('objBtn');
      if (!entrada || !oculto || !caja) return;

      oculto.style.display = 'none';
      var lista = [];

      function pintar() {
        caja.innerHTML = '';
        lista.forEach(function (t, i) {
          var e = document.createElement('span');
          e.className = 'obj-etq';
          e.appendChild(document.createTextNode(t));
          var x = document.createElement('button');
          x.type = 'button';
          x.setAttribute('aria-label', 'Quitar ' + t);
          x.textContent = '×';
          x.addEventListener('click', function () { lista.splice(i, 1); pintar(); });
          e.appendChild(x);
          caja.appendChild(e);
        });
        caja.hidden = lista.length === 0;
        oculto.value = lista.join(String.fromCharCode(10));
        btn.disabled = lista.length === 0 && entrada.value.trim() === '';
      }

      function agregar() {
        var t = entrada.value.trim().toLowerCase();
        if (!t) return false;
        // Sin repetidos: agregar dos veces la misma busqueda no aporta y
        // ensucia la tabla de resultados.
        if (lista.indexOf(t) === -1) { lista.push(t); }
        entrada.value = '';
        pintar();
        return true;
      }

      entrada.addEventListener('input', pintar);
      entrada.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); agregar(); }
      });

      form.addEventListener('submit', function (e) {
        // Lo que quedo escrito y sin confirmar tambien cuenta: si alguien
        // escribe y pulsa "Agregar" directo, esperaria que se guarde.
        agregar();
        if (!lista.length) { e.preventDefault(); entrada.focus(); }
      });

      pintar();
    })();

    /* Las pistas. Un solo manejador para todas: abren al pulsar, se cierra la
       anterior, se cierran al pulsar fuera y con Escape. Funciona igual con
       raton y con dedo, que es lo que el title del navegador no hacia. */
    (function () {
      var pistas = [].slice.call(document.querySelectorAll('.pista'));
      if (!pistas.length) return;

      function cerrar(menos) {
        pistas.forEach(function (p) {
          if (p === menos) return;
          var b = p.querySelector('.pista-b'), n = p.querySelector('.pista-nota');
          if (!b || !n) return;
          n.hidden = true;
          b.setAttribute('aria-expanded', 'false');
        });
      }

      pistas.forEach(function (p) {
        var b = p.querySelector('.pista-b'), n = p.querySelector('.pista-nota');
        if (!b || !n) return;
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var abierta = !n.hidden;
          cerrar(p);
          n.hidden = abierta;
          b.setAttribute('aria-expanded', String(!abierta));
        });
        // Con raton tambien se abre al pasar por encima: es mas rapido que
        // pulsar y no estorba a quien usa el dedo, que no dispara hover.
        p.addEventListener('mouseenter', function () { cerrar(p); n.hidden = false; b.setAttribute('aria-expanded', 'true'); });
        p.addEventListener('mouseleave', function () { n.hidden = true; b.setAttribute('aria-expanded', 'false'); });
      });

      document.addEventListener('click', function () { cerrar(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { cerrar(); }
      });
    })();

    /* ---- La gráfica acumulada sigue al cursor ---------------------------
       Al pasar por encima se marca el día más cercano y sale una burbuja con
       la fecha y el total de ese día.

       Se busca el punto más cercano en X, no el que esté justo debajo: con
       cien días la curva tiene un punto cada pocos píxeles y exigir
       puntería es exigir que nadie lo use.

       El SVG se estira con la tarjeta, así que sus coordenadas internas
       (viewBox) no son píxeles de pantalla. Todo se convierte con el ancho
       real medido, no con el declarado.

       Funciona igual con el dedo: pointermove cubre ratón y táctil. */
    (function () {
      var cajas = [].slice.call(document.querySelectorAll('.kv-acum'));
      cajas.forEach(function (caja) {
        var svg = caja.querySelector('.grafica-svg');
        var zona = caja.querySelector('.acum-zona');
        var marca = caja.querySelector('.acum-marca');
        var globo = caja.querySelector('.acum-globo');
        if (!svg || !zona || !marca || !globo) { return; }

        var puntos;
        try { puntos = JSON.parse(caja.getAttribute('data-puntos') || '[]'); }
        catch (e) { return; }
        if (!puntos.length) { return; }

        var vb = (caja.getAttribute('data-vb') || '840 250').split(' ');
        var vbW = parseFloat(vb[0]) || 840;
        var linea = marca.querySelector('line');
        var punto = marca.querySelector('circle');
        var num = globo.querySelector('.acum-globo-n');
        var fec = globo.querySelector('.acum-globo-f');

        function mostrar(e) {
          var r = svg.getBoundingClientRect();
          if (!r.width) { return; }
          var escala = vbW / r.width;              // pantalla -> viewBox
          var x = (e.clientX - r.left) * escala;

          var mejor = 0, dist = Infinity;
          for (var i = 0; i < puntos.length; i++) {
            var d = Math.abs(puntos[i].x - x);
            if (d < dist) { dist = d; mejor = i; }
          }
          var p = puntos[mejor];

          linea.setAttribute('x1', p.x);
          linea.setAttribute('x2', p.x);
          punto.setAttribute('cx', p.x);
          punto.setAttribute('cy', p.y);
          marca.setAttribute('opacity', '1');

          num.textContent = p.t + (p.t === '1' ? ' visita' : ' visitas');
          fec.textContent = p.f;
          globo.hidden = false;

          // La burbuja va en píxeles sobre la caja, no en coordenadas del
          // dibujo. Se frena en los bordes para que no se salga de la tarjeta.
          var cr = caja.getBoundingClientRect();
          var izq = r.left - cr.left + (p.x / escala);
          var ancho = globo.offsetWidth || 0;
          var tope = cr.width - ancho / 2 - 4;
          if (izq < ancho / 2 + 4) { izq = ancho / 2 + 4; }
          if (izq > tope) { izq = tope; }
          globo.style.left = izq + 'px';
          globo.style.top = (r.top - cr.top + (p.y / escala) - 12) + 'px';
        }

        function ocultar() {
          marca.setAttribute('opacity', '0');
          globo.hidden = true;
        }

        zona.addEventListener('pointermove', mostrar);
        zona.addEventListener('pointerdown', mostrar);
        zona.addEventListener('pointerleave', ocultar);
      });
    })();

    /* ---- EVOLUCIÓN DE POSICIONES: posición, pero ¿de qué? ----------------
       La tarjeta decía "Tu posición media en Google" y dibujaba una sola
       línea: la media del sitio entero, marca y descubrimiento mezcladas.

       Esa mezcla no es un matiz. Mientras a un sitio solo lo busquen por su
       nombre, su media es 2. El día que empieza a aparecer para búsquedas
       nuevas —en el puesto 90, porque así se empieza— la media se va a 50 sin
       que haya perdido un solo puesto en nada. La gráfica pintaba un derrumbe
       de 51,8 puestos donde lo que había pasado era exactamente lo contrario:
       apariciones nuevas que antes no existían.

       Ahora se elige qué se mira, y el pie de la gráfica cambia con ello.

       UN SOLO DIBUJANTE. Antes el SVG lo componía PHP. Añadir las otras tres
       vistas en JS habría dejado dos implementaciones del mismo eje invertido
       y de la misma curva, que es exactamente cómo divergieron los cinco
       :root. Se dibuja todo aquí. Las tres series suavizadas viajan ya
       calculadas en el JSON; la de una búsqueda concreta se pide a
       /api/serie-busqueda.php cuando se elige, y no antes: traer de antemano
       la serie de veinte búsquedas serían veinte llamadas a Google por visita
       para dibujar una.

       LOS HUECOS NO SON CEROS. Search Console solo devuelve los días en los
       que hubo alguna aparición. Un día ausente significa "no apareciste", y
       la posición 0 no existe: dibujarla mandaría la línea al mejor sitio de
       la gráfica justo el día que peor fue. La línea se rompe. */
    (function () {
      var datos = document.getElementById('evoDatos');
      var svg   = document.getElementById('evoSvg');
      var sel   = document.getElementById('evoQue');
      var sub   = document.getElementById('evoSub');
      var pie   = document.getElementById('evoPie');
      var cifras = document.getElementById('evoCifras');
      if (!datos || !svg || !sub || !pie || !cifras) { return; }

      var D;
      try { D = JSON.parse(datos.textContent); } catch (e) { return; }

      var W = 620, H = 340, PL = 40, PR = 20, PT = 24, PB = 36;
      var CW = W - PL - PR, CH = H - PT - PB;
      var NS = 'http://www.w3.org/2000/svg';

      /* 'YYYY-MM-DD' partido a mano y no new Date(iso): la cadena con guiones
         se interpreta como UTC y en Colombia (-05) el día 1 sale como día 30
         del mes anterior. */
      function fechaCorta(iso) {
        var p = String(iso).split('-');
        var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
        // es-CO devuelve "5 de jun"; el resto del panel escribe "5 jun".
        return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
                .replace(' de ', ' ').replace('.', '');
      }

      // La misma Catmull-Rom que kaiva_curva() en PHP: los tiradores salen del
      // punto anterior y el siguiente, así la curva pasa POR los puntos.
      function curva(pts) {
        var n = pts.length;
        if (!n) { return ''; }
        if (n === 1) { return 'M ' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1); }
        var d = 'M ' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
        for (var i = 0; i < n - 1; i++) {
          var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
          d += ' C ' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ',' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)
             + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ',' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)
             + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
        }
        return d;
      }

      function el(nombre, attrs) {
        var n = document.createElementNS(NS, nombre);
        for (var k in attrs) { if (attrs[k] !== null) { n.setAttribute(k, attrs[k]); } }
        return n;
      }

      function vaciar(nodo) { while (nodo.firstChild) { nodo.removeChild(nodo.firstChild); } }

      /* Las búsquedas las escribe quien busca en Google, no nosotros: llegan
         desde Search Console tal cual las tecleó un desconocido. Todo lo que
         vaya a innerHTML pasa por aquí. */
      function esc(s) { var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

      function num(v, dec) { return Number(v).toFixed(dec === undefined ? 1 : dec); }

      /* Dibuja. `puntos` es [{fecha, pos}] con pos posiblemente null.

         DOS MODOS, y no es cosmética. La serie suavizada es continua: tiene
         valor todos los días y se lee como una tendencia, con su relleno
         debajo. La de UNA búsqueda no: en 90 días una búsqueda de un sitio
         joven aparece veinte o treinta, sueltos. Dibujada igual, cada pareja
         de días seguidos salía como una raya casi vertical con una astilla de
         relleno debajo, y noventa días se leían como una valla de picos que
         no dicen nada.

         En modo 'puntos' se marca cada día medido con su punto, se unen solo
         las rachas de tres días o más, y no hay relleno: el relleno insinúa
         continuidad, y aquí lo que hay son mediciones sueltas. */
      function dibujar(puntos, etiqueta, modo) {
        vaciar(svg);
        var conDato = puntos.filter(function (p) { return p.pos !== null && p.pos > 0; });

        if (conDato.length < 2) {
          cifras.innerHTML = '';
          svg.appendChild(el('text', {
            x: W / 2, y: H / 2, 'font-size': 13, 'font-weight': 600,
            fill: 'var(--ink-soft)', 'text-anchor': 'middle'
          })).textContent = conDato.length === 1
            ? 'Un solo día con apariciones: todavía no hay línea que dibujar.'
            : 'Sin apariciones registradas en este periodo.';
          return conDato;
        }

        var vals = conDato.map(function (p) { return p.pos; });
        var mejor = Math.min.apply(null, vals), peor = Math.max.apply(null, vals);
        var ejeTop = Math.max(1, Math.floor(mejor - 1));
        var ejeBot = Math.ceil(peor + 1);
        if (ejeBot - ejeTop < 6) { ejeBot = ejeTop + 6; }
        var rango = ejeBot - ejeTop;
        var n = puntos.length;

        // Más posición = más abajo. El eje va al revés a propósito.
        var py = function (v) { return PT + ((v - ejeTop) / rango) * CH; };
        var px = function (i) { return PL + (n > 1 ? (i / (n - 1)) * CW : CW / 2); };

        var defs = el('defs', {});
        var grad = el('linearGradient', { id: 'gradPos', x1: '0', y1: '0', x2: '0', y2: '1' });
        grad.appendChild(el('stop', { offset: '0%', 'stop-color': 'rgba(130,66,245,.16)' }));
        grad.appendChild(el('stop', { offset: '100%', 'stop-color': 'rgba(130,66,245,0)' }));
        defs.appendChild(grad);
        svg.appendChild(defs);

        for (var k = 0; k <= 3; k++) {
          var val = Math.round(ejeTop + (rango * k / 3));
          var y = py(val);
          svg.appendChild(el('line', { x1: PL, y1: y, x2: W - PR, y2: y, stroke: 'var(--line)', 'stroke-width': 1 }));
          var t = el('text', { x: PL - 10, y: y + 4, 'font-size': 11, 'font-weight': 600, fill: 'var(--ink-faint)', 'text-anchor': 'end' });
          t.textContent = String(val);
          svg.appendChild(t);
        }

        /* Un trazo por cada racha de días con datos. Los huecos quedan
           huecos: unir dos días separados por tres semanas dibujaría una
           pendiente que nadie midió. */
        var tramo = [];
        var tramos = [];
        puntos.forEach(function (p, i) {
          if (p.pos !== null && p.pos > 0) { tramo.push([px(i), py(p.pos)]); }
          else if (tramo.length) { tramos.push(tramo); tramo = []; }
        });
        if (tramo.length) { tramos.push(tramo); }

        var disperso = modo === 'puntos';
        var minTramo = disperso ? 3 : 2;

        tramos.forEach(function (t) {
          if (t.length >= minTramo) {
            var linea = curva(t);
            if (!disperso) {
              svg.appendChild(el('path', {
                d: linea + ' L ' + t[t.length - 1][0].toFixed(1) + ',' + (PT + CH) + ' L ' + t[0][0].toFixed(1) + ',' + (PT + CH) + ' Z',
                fill: 'url(#gradPos)'
              }));
            }
            svg.appendChild(el('path', {
              d: linea, fill: 'none', stroke: 'var(--violet)', 'stroke-width': disperso ? 2 : 2.5,
              'stroke-linecap': 'round', 'stroke-linejoin': 'round'
            }));
          }
          // Cada día medido lleva su punto cuando la serie es dispersa; en la
          // continua solo lo llevaría el día suelto, que ahí no existe.
          if (disperso) {
            t.forEach(function (p) {
              svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: 3, fill: 'var(--violet)' }));
            });
          } else if (t.length === 1) {
            svg.appendChild(el('circle', { cx: t[0][0], cy: t[0][1], r: 3.5, fill: 'var(--violet)' }));
          }
        });

        var ultimo = tramos[tramos.length - 1];
        var fin = ultimo[ultimo.length - 1];
        svg.appendChild(el('circle', { cx: fin[0], cy: fin[1], r: 5, fill: '#fff', stroke: 'var(--violet)', 'stroke-width': 3 }));

        var t1 = el('text', { x: PL, y: H - 10, 'font-size': 10.5, 'font-weight': 600, fill: 'var(--ink-faint)', 'text-anchor': 'start' });
        t1.textContent = fechaCorta(puntos[0].fecha);
        svg.appendChild(t1);
        var t2 = el('text', { x: W - PR, y: H - 10, 'font-size': 10.5, 'font-weight': 600, fill: 'var(--ink-faint)', 'text-anchor': 'end' });
        t2.textContent = fechaCorta(puntos[n - 1].fecha);
        svg.appendChild(t2);

        svg.setAttribute('aria-label', etiqueta + ': de ' + fechaCorta(puntos[0].fecha) + ' a ' + fechaCorta(puntos[n - 1].fecha)
          + '. Ahora, posición ' + num(conDato[conDato.length - 1].pos) + '.');

        var ahora = conDato[conDato.length - 1].pos;
        var delta = conDato[0].pos - ahora;   // positivo = mejoró
        cifras.innerHTML =
          '<div><span class="evo-cifra-et">Ahora</span><strong>' + num(ahora) + '</strong></div>' +
          '<div><span class="evo-cifra-et">Mejor en el periodo</span><strong>' + num(mejor) + '</strong></div>' +
          '<div><span class="evo-cifra-et">' + (delta >= 0 ? 'Has subido' : 'Has bajado') + '</span>' +
          '<strong class="' + (delta >= 0 ? 'sube' : 'baja') + '">' + num(Math.abs(delta)) + ' puestos</strong></div>';

        return conDato;
      }

      var PIE_MEDIA = 'Cada punto es la media de los últimos 7 días, <strong>ponderada por apariciones</strong>: '
        + 'un día con 30 apariciones pesa treinta veces más que uno con una. '
        + 'El eje va al revés a propósito: en posiciones, 1 es lo mejor.';

      function pintarSerie(clave) {
        var s = D.series[clave];
        if (!s) { return; }
        dibujar(s.puntos.map(function (p) { return { fecha: p.fecha, pos: p.pos }; }), s.etiqueta, 'media');

        var texto = PIE_MEDIA;
        if (s.apariciones < 500) {
          texto += ' Hace falta porque todavía tienes poco volumen —' + s.apariciones
            + ' apariciones en ' + s.dias + ' días—, y ahí una sola búsqueda rara en el puesto 180 '
            + 'movería la media del día entero sin que hubiera pasado nada.';
        }

        if (clave === 'total') {
          sub.innerHTML = 'La media de <strong>todas</strong> tus búsquedas juntas, ponderada por apariciones.';
          texto += ' <strong>Ojo con este número:</strong> mezcla las búsquedas de tu nombre con las de '
            + 'descubrimiento. Cuando empiezas a aparecer para búsquedas nuevas —siempre por el puesto 80 o 90— '
            + 'esta media baja aunque no hayas perdido una sola posición. Para medir el trabajo, mira '
            + '«Solo descubrimiento».';
        } else if (clave === 'desc') {
          sub.innerHTML = 'Solo las búsquedas de gente que <strong>no te conocía</strong>. Es la que mide si el trabajo de visibilidad sirve.';
        } else {
          sub.innerHTML = 'Solo las búsquedas de <strong>tu propio nombre</strong>. Quien las hace ya te conocía: esta línea mide reconocimiento, no descubrimiento.';
        }
        pie.innerHTML = texto;
      }

      function pintarConsulta(q) {
        sub.innerHTML = 'Posición de <strong>«' + esc(q) + '»</strong>, día a día.';
        pie.textContent = 'Consultando a Google…';
        cifras.innerHTML = '';
        vaciar(svg);

        var url = '/api/serie-busqueda.php?dominio=' + encodeURIComponent(D.dominio)
                + '&q=' + encodeURIComponent(q) + '&dias=90';

        fetch(url, { credentials: 'same-origin' })
          .then(function (r) { return r.json().then(function (j) { return { estado: r.status, cuerpo: j }; }); })
          .then(function (res) {
            if (!res.cuerpo || res.cuerpo.ok !== true) {
              if (res.cuerpo && res.cuerpo.necesita_reconectar) {
                pie.innerHTML = 'Perdimos el acceso a tu cuenta de Google. '
                  + '<a href="' + (res.cuerpo.conectar_url || '#') + '">Volver a conectar</a>.';
              } else {
                pie.textContent = (res.cuerpo && res.cuerpo.error) || 'No pudimos consultar Search Console.';
              }
              return;
            }
            var serie = (res.cuerpo.serie || []).map(function (p) {
              return { fecha: p.fecha, pos: p.posicion === null ? null : Number(p.posicion) };
            });
            var conDato = dibujar(serie, q, 'puntos');
            var dias = res.cuerpo.dias_con_datos || conDato.length;
            pie.innerHTML = 'Aquí <strong>no hay media móvil</strong>: es la posición de cada día tal como la '
              + 'devuelve Google. De los ' + serie.length + ' días del periodo apareciste en <strong>'
              + dias + '</strong>; los demás dejan un hueco en la línea, no un cero — la posición 0 no existe. '
              + 'El eje va al revés: en posiciones, 1 es lo mejor.';
          })
          .catch(function () {
            pie.textContent = 'No pudimos consultar Search Console. Revisa la conexión y vuelve a elegir.';
          });
      }

      function pintar() {
        var v = sel ? sel.value : 'serie:' + (D.series.desc.puntos.length >= 3 ? 'desc' : 'total');
        if (v.indexOf('q:') === 0) { pintarConsulta(v.slice(2)); }
        else { pintarSerie(v.slice(6)); }
      }

      if (sel) { sel.addEventListener('change', pintar); }
      pintar();
    })();
  