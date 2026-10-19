// La cara del robot como una pantalla: los ojos (y a veces la boca) se dibujan en un lienzo 2D que se
// pinta sobre el visor curvo de modelo.js. Así caben todas las expresiones de la hoja de diseño (oct 2026):
// neutral, feliz, hablando, sorprendido, pensando, entusiasmado, concentrado, escuchando, dormido.
import * as THREE from 'three'

const NUCLEO = '#a580d6'    // centro de los ojos: el morado claro de la marca (2026-10-19: «más de nuestro morado»)
const BORDE = '#7a3fc9'     // el canto de los ojos: el morado de la marca
const BRILLO = '#7a3fc9'    // el resplandor de los ojos, en el morado de la marca

export function crearCara (robot) {
  // la cara se pinta en el propio visor (curvo), como luz que sale del vidrio negro
  const lienzo = document.createElement('canvas')
  lienzo.width = 512
  lienzo.height = 324
  const g = lienzo.getContext('2d')
  const textura = new THREE.CanvasTexture(lienzo)
  textura.colorSpace = THREE.SRGBColorSpace
  textura.anisotropy = 4
  textura.flipY = false   // las uv del .glb ya vienen con el eje v de glTF
  const pantalla = robot.visor
  pantalla.material.emissiveMap = textura
  pantalla.material.emissiveIntensity = 1.25
  pantalla.material.needsUpdate = true

  const W = lienzo.width
  const H = lienzo.height
  // ojos más pequeños y más juntos (2026-10-19: «muy ojón y con los ojos muy separados»)
  const ojoAncho = 64
  const ojoAlto = 110
  const sep = 102   // de la línea central a cada ojo

  function pastilla (x, y, w, h) {
    // halo violeta debajo y el núcleo claro encima, como la luz de la hoja de diseño
    const relleno = g.fillStyle
    const forma = (ww, hh) => { g.beginPath(); g.roundRect(x - ww / 2, y - hh / 2, ww, hh, Math.min(ww, hh) / 2); g.fill() }
    g.save()
    g.fillStyle = BORDE
    g.shadowBlur = 56
    forma(w + 12, h + 12)
    g.restore()
    g.fillStyle = relleno
    forma(w, h)
  }
  function arco (x, y, w, arriba) {   // ^ (feliz) o ︶ (dormido)
    g.beginPath()
    if (arriba) g.arc(x, y + w * 0.35, w * 0.55, Math.PI * 1.15, Math.PI * 1.85)
    else g.arc(x, y - w * 0.35, w * 0.55, Math.PI * 0.15, Math.PI * 0.85)
    g.stroke()
  }
  function estrella (x, y, r) {
    g.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2
      const rr = i % 2 ? r * 0.3 : r
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    g.closePath()
    g.fill()
  }

  // estado: neutral · feliz · hablando · sorprendido · pensando · entusiasmado · concentrado · escuchando · dormido
  // mirar: {x, y} de -1 a 1 · abre: 0 a 1 (parpadeo) · voz: 0 a 1 (boca al hablar)
  function dibujar ({ estado = 'neutral', mirar = { x: 0, y: 0 }, abre = 1, voz = 0, t = 0 }) {
    g.fillStyle = '#000'
    g.fillRect(0, 0, W, H)
    g.fillStyle = NUCLEO
    g.strokeStyle = NUCLEO
    g.lineWidth = 22
    g.lineCap = 'round'
    g.shadowColor = BRILLO
    g.shadowBlur = 40
    const dx = mirar.x * 30
    const dy = mirar.y * 18
    const cy = H * 0.52 + dy
    const izq = W / 2 - sep + dx
    const der = W / 2 + sep + dx
    const boca = (ancho, alto) => { g.beginPath(); g.ellipse(W / 2 + dx * 0.6, cy + 96, ancho, alto, 0, 0, Math.PI * 2); g.fill() }
    const sonrisa = () => { g.lineWidth = 14; g.beginPath(); g.arc(W / 2 + dx * 0.6, cy + 62, 26, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); g.lineWidth = 22 }

    switch (estado) {
      case 'feliz':
        arco(izq, cy, 96, true); arco(der, cy, 96, true); sonrisa(); break
      case 'entusiasmado':
        estrella(izq, cy, 66 + Math.sin(t * 6) * 4); estrella(der, cy, 66 + Math.sin(t * 6 + 1) * 4); break
      case 'dormido':
        arco(izq, cy + 12, 90, false); arco(der, cy + 12, 90, false); break
      case 'sorprendido':
        g.beginPath(); g.arc(izq, cy, 54, 0, Math.PI * 2); g.fill()
        g.beginPath(); g.arc(der, cy, 54, 0, Math.PI * 2); g.fill()
        boca(16, 18); break
      case 'pensando':
        g.beginPath(); g.moveTo(izq - 46, cy + 8); g.lineTo(izq + 46, cy - 4); g.stroke()   // uno entrecerrado
        pastilla(der + 8, cy - 12, ojoAncho * 0.9, ojoAlto * 0.85 * abre); break           // el otro mira arriba
      case 'concentrado':
        pastilla(izq, cy + 14, ojoAncho, ojoAlto * 0.5 * abre); pastilla(der, cy + 14, ojoAncho, ojoAlto * 0.5 * abre); break
      case 'escuchando':
        pastilla(izq, cy, ojoAncho * 1.08, ojoAlto * 1.1 * abre); pastilla(der, cy, ojoAncho * 1.08, ojoAlto * 1.1 * abre)
        g.lineWidth = 8   // ondas de sonido al lado
        for (let i = 0; i < 2; i++) { g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6 - i); g.beginPath(); g.arc(der + 30, cy, 86 + i * 22, -0.4, 0.4); g.stroke() }
        g.globalAlpha = 1; break
      case 'hablando':
        pastilla(izq, cy, ojoAncho, ojoAlto * 0.92 * abre); pastilla(der, cy, ojoAncho, ojoAlto * 0.92 * abre)
        boca(26 + voz * 10, 8 + voz * 20); break
      default:
        pastilla(izq, cy, ojoAncho, ojoAlto * abre); pastilla(der, cy, ojoAncho, ojoAlto * abre)
    }
    textura.needsUpdate = true
  }

  return { dibujar, pantalla }
}
