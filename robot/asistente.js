// El robot como cara del chat «Pregúntale» de Kaiva OS (vistas/_os-js.php).
// Se dibuja en pequeño dentro del botón flotante y cambia de expresión con la conversación:
// escuchando mientras escribes, pensando mientras busca, hablando al contestar, feliz al saludar.
// El chat lo maneja con window.kvRobot.estado('pensando'), etc.
import * as THREE from 'three'
import { cargarRobotKaiva, luzDeEstudio } from './modelo.js'
import { crearCara } from './cara.js'

const lienzo = document.getElementById('asis-robot')
if (lienzo) iniciar(lienzo)

async function iniciar (lienzo) {
  const render = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true })
  render.setPixelRatio(Math.min(devicePixelRatio, 2))
  render.toneMapping = THREE.NeutralToneMapping   // ACES agrisaba el blanco (2026-10-19: «aún más blanco»)
  render.outputColorSpace = THREE.SRGBColorSpace
  /* Nítido (2026-10-19): el lienzo se dibuja siempre a su tamaño real en pantalla. Antes se medía
     una sola vez al cargar, y si el tamaño cambiaba después, la imagen quedaba estirada y borrosa. */
  let lado = 0
  const ajustar = () => {
    const w = Math.round(lienzo.clientWidth) || 96
    if (w === lado) return
    lado = w
    render.setPixelRatio(Math.min(devicePixelRatio, 2))
    render.setSize(lado, lado, false)
  }
  ajustar()
  if (window.ResizeObserver) new ResizeObserver(ajustar).observe(lienzo)
  addEventListener('resize', ajustar)

  const escena = new THREE.Scene()
  const estudio = new THREE.Scene()
  estudio.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x6e6880, side: THREE.BackSide })))
  const luz = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2), side: THREE.DoubleSide }))
  luz.position.set(-2, 8, 5); luz.lookAt(0, 0, 0); estudio.add(luz)
  escena.environment = new THREE.PMREMGenerator(render).fromScene(estudio, 0.02).texture
  luzDeEstudio(escena)

  const camara = new THREE.PerspectiveCamera(30, 1, 0.1, 20)
  camara.position.set(0, 0.1, 3.6)
  const cuerpo = new THREE.Group()
  const actitud = new THREE.Group()
  cuerpo.add(actitud)
  escena.add(cuerpo)

  const robot = await cargarRobotKaiva()
  robot.charco.visible = false   // en el botón no hay piso
  actitud.add(robot.raiz)
  const cara = crearCara(robot)

  const a = { t: 0, estado: 'feliz', hasta: 1.6, voz: 0, mirarX: 0, mirarY: 0, cerrado: 0, parpadeo: 0, proximo: 2.5, rebote: 0, reboteV: 6, ojosHasta: 0 }
  /* Al tocarlo, cierra los ojos un momento (pedido del 2026-10-19). */
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('[data-asis-abrir], #asis-boton')) { a.ojosHasta = a.t + 0.45; a.reboteV += 4 }
  })
  const raton = { x: 0, y: 0 }
  addEventListener('pointermove', e => {
    const r = lienzo.getBoundingClientRect()
    raton.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 500))
    raton.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 400))
  })

  // estados con duración: al terminar vuelve a «neutral»
  window.kvRobot = {
    estado (estado, segundos = 0) {
      a.estado = estado
      a.hasta = segundos ? a.t + segundos : Infinity
      if (estado === 'feliz' || estado === 'sorprendido') a.reboteV += 6
    }
  }

  const suave = (x, y, k, dt) => x + (y - x) * (1 - Math.exp(-k * dt))
  /* Fluidez (2026-10-19): si el robot no se ve (en Inicio, al bajar, el de la cabecera sale de la
     pantalla), deja de dibujarse; así la GPU queda libre para el resto del panel. */
  let visible = true
  let pedido = 0
  if (window.IntersectionObserver) {
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible && !pedido) { antes = performance.now(); pedido = requestAnimationFrame(cuadro) }
    }).observe(lienzo)
  }
  let antes = performance.now()
  function cuadro (ahora) {
    pedido = 0
    if (!visible) return
    const dt = Math.min((ahora - antes) / 1000, 1 / 30)
    antes = ahora
    a.t += dt
    if (a.t > a.hasta) { a.estado = 'neutral'; a.hasta = Infinity }

    const piensa = a.estado === 'pensando'
    a.mirarX = suave(a.mirarX, piensa ? 0.5 : raton.x, 5, dt)
    a.mirarY = suave(a.mirarY, piensa ? -0.7 : raton.y, 5, dt)
    actitud.rotation.set(a.mirarY * 0.25, a.mirarX * 0.35, Math.sin(a.t * 1.2) * 0.04 + (piensa ? 0.12 : 0), 'YXZ')
    a.reboteV += (-170 * a.rebote - 9 * a.reboteV) * dt
    a.rebote += a.reboteV * dt
    const r = Math.max(-0.25, Math.min(0.25, a.rebote))
    cuerpo.position.y = Math.sin(a.t * 1.6) * 0.06   // flota dentro de la escena: nada de mover el lienzo
    cuerpo.scale.set(1 - r * 0.5, 1 + r, 1 - r * 0.5)

    // aletas: solo se mecen un poquito al flotar; no se alzan (pedido del 2026-10-19)
    for (const b of robot.brazos) b.pivote.rotation.z = b.base.z + b.lado * Math.sin(a.t * 1.6 + 0.6) * 0.05
    const respingo = Math.max(0, Math.sin(a.t * 0.9) - 0.96) * 6
    for (const o of robot.orejas) o.pivote.rotation.z = o.base.z - o.lado * (respingo * 0.25 + (a.estado === 'escuchando' ? 0.12 : 0))

    a.parpadeo += dt
    if (a.parpadeo > a.proximo) { a.cerrado = 1; a.parpadeo = 0; a.proximo = Math.random() < 0.18 ? 0.22 : 2 + Math.random() * 3 }
    a.cerrado = Math.max(0, a.cerrado - dt / 0.14)
    const objetivoVoz = a.estado === 'hablando' ? (Math.sin(a.t * 17) * 0.5 + 0.5) * (Math.sin(a.t * 5.3) > -0.3 ? 1 : 0.1) : 0
    a.voz = suave(a.voz, objetivoVoz, 20, dt)
    /* SIN CARAS (pedido del 2026-10-19): siempre los mismos ojos. Solo parpadean a ratos, como
       una persona, y se cierran un momento al tocarlo. */
    const abre = a.t < a.ojosHasta ? 0.06 : 1 - Math.sin(a.cerrado * Math.PI) * 0.94
    cara.dibujar({ estado: 'neutral', mirar: { x: 0, y: 0 }, abre, voz: 0, t: a.t })

    render.render(escena, camara)
    pedido = requestAnimationFrame(cuadro)
  }
  pedido = requestAnimationFrame(cuadro)
}
