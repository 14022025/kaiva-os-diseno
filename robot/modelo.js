// El robot de Kaiva: robot.glb. Desde el 2026-10-19 es el modelo que hizo el equipo (generado a
// partir de su render y rehecho en Blender: malla limpia, base un poco redondeada, visor liso
// con su uv para la cara, y un esqueleto sencillo: Cuerpo → Brazo_I/D y Oreja_I/D).
// Cabeza de huevo ancho en porcelana lavanda con orejas de gato, visor negro donde cara.js dibuja
// los ojos, dos tomas violeta y dos aletas. Aquí se cargan las piezas, se les ponen materiales con
// barniz y se arma lo que anima robot.js. Mira hacia +Z. Mide ~1,1 de alto y ~1,9 de ancho.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const PORCELANA = '#ffffff'   // blanco (2026-10-19: «aún más blanco», dos veces)
const TOMA = '#8a55c4'        // el violeta de las tomas de los brazos
const VIOLETA = '#7a3fc9'

export async function cargarRobotKaiva (url = 'robot/robot.glb') {
  const gltf = await new GLTFLoader().loadAsync(url)
  const raiz = new THREE.Group()
  raiz.add(gltf.scene)

  const porcelana = new THREE.MeshPhysicalMaterial({
    // barniz suave (2026-10-19): con barniz entero, el borde reflejaba el estudio oscuro y se veía
    // un contorno gris al moverse
    name: 'porcelana', color: PORCELANA, roughness: 0.3, metalness: 0,
    clearcoat: 0.3, clearcoatRoughness: 0.2, envMapIntensity: 0.6, sheen: 0.1, sheenColor: new THREE.Color('#f6f4fb'), sheenRoughness: 0.5
  })
  const anillo = new THREE.MeshPhysicalMaterial({ name: 'anillo', color: TOMA, roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 })
  const vidrio = new THREE.MeshPhysicalMaterial({
    name: 'visor', color: 0x050409, roughness: 0.1, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0xffffff, emissiveIntensity: 0
  })
  const luz = new THREE.MeshStandardMaterial({ name: 'luz', color: 0x000000, emissive: VIOLETA, emissiveIntensity: 2.2 })
  const hueco = new THREE.MeshStandardMaterial({ name: 'hueco', color: 0x1a1428, roughness: 0.4, emissive: '#3a1a72', emissiveIntensity: 1 })
  const materiales = { porcelana, visor: vidrio, luz, hueco, anillo }

  let visor = null
  const brazos = []
  const orejas = []
  const huesos = []
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse(n => {
    if (n.isMesh) {
      n.material = materiales[n.material?.name] ?? porcelana
      n.frustumCulled = false   // con esqueleto, la caja de la malla no sigue a las aletas
    }
    if (n.name === 'Visor' && !visor) visor = n.isMesh ? n : n.getObjectByProperty('isMesh', true)
    const m = /^(Brazo|Oreja)_(I|D)$/.exec(n.name)
    if (!m) return
    const lado = m[2] === 'D' ? 1 : -1
    if (n.isBone) {
      /* Con esqueleto: robot.js mueve un «pivote» (rotation.z, como antes) y aquí ese giro se
         pasa al hueso alrededor del eje que mira al frente (+Z del robot), sea cual sea la
         orientación con que Blender dejó el hueso. */
      const pivote = new THREE.Object3D()
      const q = new THREE.Quaternion()
      n.parent.getWorldQuaternion(q)
      const eje = new THREE.Vector3(0, 0, 1).applyQuaternion(q.invert()).normalize()
      huesos.push({ hueso: n, pivote, eje, reposo: n.quaternion.clone() })
      ;(m[1] === 'Brazo' ? brazos : orejas).push({ pivote, lado, base: pivote.rotation.clone() })
    } else if (m[1] === 'Brazo') {
      // modelo anterior: el origen de cada brazo es el hombro y se mece girándolo en z
      brazos.push({ pivote: n, lado, base: n.rotation.clone() })
    }
  })
  if (huesos.length) {
    const giro = new THREE.Quaternion()
    const actualizar = raiz.updateMatrixWorld.bind(raiz)
    raiz.updateMatrixWorld = function (force) {
      for (const h of huesos) {
        giro.setFromAxisAngle(h.eje, h.pivote.rotation.z)
        h.hueso.quaternion.copy(h.reposo).premultiply(giro)
      }
      actualizar(force)
    }
  }

  // la sombra en el piso: negra y difusa (sin resplandor de color, regla de la casa)
  const lienzo = document.createElement('canvas')
  lienzo.width = lienzo.height = 128
  const g = lienzo.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(8, 8, 8, .32)')
  grad.addColorStop(1, 'rgba(8, 8, 8, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const charco = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.7).rotateX(-1.2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lienzo), transparent: true, depthWrite: false, toneMapped: false })
  )
  charco.position.y = -0.78
  raiz.add(charco)
  // (sin luz violeta debajo: era un resplandor de color)

  return { raiz, visor, ojos: [], orejas, brazos, luz, charco, u: 1, sx: 1 }
}

// Luz de estudio con contraluz lavanda, para que el borde de la porcelana se separe del fondo.
export function luzDeEstudio (escena) {
  escena.add(new THREE.HemisphereLight(0xffffff, 0xcfc8e0, 1.15))   // suelo claro: sin sombra morada abajo
  const clave = new THREE.DirectionalLight(0xffffff, 1.9)
  clave.position.set(-1.5, 3, 3)
  const contra = new THREE.DirectionalLight(0xd9ccff, 1.1)
  contra.position.set(2.5, 1, -2.5)
  escena.add(clave, contra)
}
