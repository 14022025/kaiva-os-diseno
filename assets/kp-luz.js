/* ============================================================================
   LA LUZ DEL LOGIN (2026-10-19). Un resplandor morado oscuro que sigue al
   mouse con un poco de retraso y deja un rastro que se va apagando, así su
   forma se estira con el movimiento en vez de ser un círculo fijo. Nace
   apagado y se enciende poco a poco con el movimiento: nunca aparece de golpe,
   tampoco al entrar por una esquina. Quieto, se desvanece solo.
   Se dibuja en un lienzo pequeño (la mitad de la pantalla) que el CSS agranda
   y difumina: así queda suave y casi no gasta.
   No corre en pantallas táctiles ni con «movimiento reducido».
   ============================================================================ */
(function () {
  var fondo = document.querySelector('.kp--luz .kp-fondo');
  if (!fondo || !window.matchMedia) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(hover: hover)').matches) return;

  var lienzo = document.createElement('canvas');
  lienzo.className = 'kp-luz';
  lienzo.setAttribute('aria-hidden', 'true');
  fondo.appendChild(lienzo);
  // El grano (ver .kp-grano en src/pantalla.php): ruido gris, hecho una vez.
  var ruido = document.createElement('canvas');
  ruido.width = ruido.height = 160;
  var gr0 = ruido.getContext('2d'), img = gr0.createImageData(160, 160);
  for (var i = 0; i < img.data.length; i += 4) {
    var v = 128 + (Math.random() - 0.5) * 70;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  gr0.putImageData(img, 0, 0);
  var grano = document.createElement('div');
  grano.className = 'kp-grano';
  grano.style.backgroundImage = 'url(' + ruido.toDataURL() + ')';
  fondo.appendChild(grano);
  var g = lienzo.getContext('2d');
  var ESC = 0.5;                 // el lienzo va a media resolución
  var w = 0, h = 0;
  function medir () {
    w = Math.ceil(innerWidth * ESC); h = Math.ceil(innerHeight * ESC);
    lienzo.width = w; lienzo.height = h;
  }
  medir();
  addEventListener('resize', medir);

  var meta = null, pos = null, energia = 0, corriendo = false, ultimo = 0;

  addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var x = e.clientX * ESC, y = e.clientY * ESC;
    if (!meta) { meta = { x: x, y: y }; pos = { x: x, y: y }; }
    var paso = Math.hypot(x - meta.x, y - meta.y);
    meta.x = x; meta.y = y;
    // Cuanto más se mueve, más se enciende; sube despacio, nunca de golpe.
    energia = Math.min(1, energia + Math.min(paso, 40) / 260);
    ultimo = performance.now();
    if (!corriendo) { corriendo = true; requestAnimationFrame(cuadro); }
  });
  document.addEventListener('mouseleave', function () { ultimo = 0; });

  function mancha (x, y, r, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(54, 17, 95, ' + a + ')');          // #36115F, el más hondo
    gr.addColorStop(0.45, 'rgba(78, 30, 134, ' + (a * 0.55) + ')'); // #4E1E86
    gr.addColorStop(1, 'rgba(78, 30, 134, 0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  function cuadro (t) {
    // El rastro: lo de antes se borra un poco en cada cuadro.
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0, 0, 0, 0.05)';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';

    if (pos && meta) {
      // La luz va detrás del mouse, con un poco de retraso.
      pos.x += (meta.x - pos.x) * 0.09;
      pos.y += (meta.y - pos.y) * 0.09;
      // Quieta (o fuera de la ventana) se va apagando.
      if (t - ultimo > 120) energia *= 0.965;
      if (energia > 0.004) mancha(pos.x, pos.y, 120 + 50 * energia, 0.085 * energia);
    }

    // Se detiene cuando ya no queda nada encendido.
    if (energia > 0.004 || t - ultimo < 2500) requestAnimationFrame(cuadro);
    else { corriendo = false; g.clearRect(0, 0, w, h); }
  }
})();
