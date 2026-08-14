import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'

const HALF_PI = Math.PI / 2
const AXIS_VECTOR = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
}
const FACE_COLORS = ['#c41e3a', '#ff6d00', '#f4f5f7', '#ffd500', '#00a651', '#0051ba']

const easeInOut = value => value < .5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2

const stickerTexture = color => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')
    context.fillStyle = '#08090b'
    context.fillRect(0, 0, size, size)
    const inset = 14, radius = 30, width = size - inset * 2
    context.beginPath()
    context.roundRect(inset, inset, width, width, radius)
    context.fillStyle = color
    context.fill()
    const gloss = context.createLinearGradient(0, 0, size, size)
    gloss.addColorStop(0, 'rgba(255,255,255,.34)')
    gloss.addColorStop(.42, 'rgba(255,255,255,.04)')
    gloss.addColorStop(1, 'rgba(0,0,0,.2)')
    context.fillStyle = gloss
    context.fill()
    context.beginPath()
    context.roundRect(inset + 2, inset + 2, width - 4, width - 4, radius - 2)
    context.strokeStyle = 'rgba(255,255,255,.16)'
    context.lineWidth = 2
    context.stroke()
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
}

class RubiksStage {
    constructor({container, engine, state, onTurn, onError}) {
        this.container = container
        this.engine = engine
        this.state = state
        this.onTurn = onTurn
        this.onError = onError
        this.cubies = []
        this.drag = null
        this.animation = null
        this.busy = false
        this.inputEnabled = true
        this.disposed = false
        this.pointerMove = event => this.movePointer(event)
        this.pointerUp = event => this.endPointer(event)
        this.visibilityChange = () => { if (!document.hidden) this.resize() }
        this.initialize()
    }

    initialize() {
        try {
            this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'high-performance'})
        } catch (error) {
            this.onError?.(error)
            return
        }
        this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping
        this.renderer.toneMappingExposure = 1.08
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
        this.renderer.domElement.className = 'cube-canvas'
        this.renderer.domElement.tabIndex = 0
        this.container.append(this.renderer.domElement)

        this.scene = new THREE.Scene()
        this.camera = new THREE.PerspectiveCamera(36, 1, .1, 50)
        this.camera.position.set(4.8, 4.3, 6.2)
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x59616c, 2.1))
        const key = new THREE.DirectionalLight(0xffffff, 3.4)
        key.position.set(4.5, 8, 5.5)
        key.castShadow = true
        key.shadow.mapSize.set(1024, 1024)
        key.shadow.camera.left = key.shadow.camera.bottom = -5
        key.shadow.camera.right = key.shadow.camera.top = 5
        key.shadow.camera.near = 1
        key.shadow.camera.far = 24
        key.shadow.bias = -.00035
        this.scene.add(key)
        const rim = new THREE.DirectionalLight(0x9bbcff, .85)
        rim.position.set(-5, 2, -5)
        this.scene.add(rim)

        this.root = new THREE.Group()
        this.pivot = new THREE.Group()
        this.scene.add(this.root, this.pivot)
        this.geometry = new RoundedBoxGeometry(.94, .94, .94, 4, .055)
        this.bodyMaterial = new THREE.MeshStandardMaterial({color: 0x090a0c, roughness: .28, metalness: .08})
        this.textures = FACE_COLORS.map(stickerTexture)
        this.faceMaterials = this.textures.map(map => new THREE.MeshStandardMaterial({
            map,
            color: 0xffffff,
            roughness: .24,
            metalness: .025,
        }))
        this.engine.COORDINATES.forEach((home, piece) => {
            const materials = [
                home[0] === 1 ? this.faceMaterials[0] : this.bodyMaterial,
                home[0] === -1 ? this.faceMaterials[1] : this.bodyMaterial,
                home[1] === 1 ? this.faceMaterials[2] : this.bodyMaterial,
                home[1] === -1 ? this.faceMaterials[3] : this.bodyMaterial,
                home[2] === 1 ? this.faceMaterials[4] : this.bodyMaterial,
                home[2] === -1 ? this.faceMaterials[5] : this.bodyMaterial,
            ]
            const cubie = new THREE.Mesh(this.geometry, materials)
            cubie.castShadow = true
            cubie.receiveShadow = true
            cubie.userData.piece = piece
            this.root.add(cubie)
            this.cubies.push(cubie)
        })
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(18, 18),
            new THREE.ShadowMaterial({opacity: .2}),
        )
        ground.rotation.x = -HALF_PI
        ground.position.y = -1.72
        ground.receiveShadow = true
        this.scene.add(ground)

        this.raycaster = new THREE.Raycaster()
        this.ndc = new THREE.Vector2()
        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = false
        this.controls.enablePan = false
        this.controls.minDistance = 5.4
        this.controls.maxDistance = 16
        this.controls.minPolarAngle = .35
        this.controls.maxPolarAngle = Math.PI - .35
        this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
        this.controls.touches.ONE = THREE.TOUCH.ROTATE
        this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
        this.controls.target.set(0, 0, 0)
        this.controls.addEventListener('change', () => this.draw())
        this.controls.update()

        const canvas = this.renderer.domElement
        canvas.addEventListener('pointerdown', event => this.beginPointer(event), {capture: true})
        canvas.addEventListener('contextmenu', event => event.preventDefault())
        canvas.addEventListener('webglcontextlost', event => {
            event.preventDefault()
            this.onError?.(new Error('WebGL context lost'))
        })
        window.addEventListener('pointermove', this.pointerMove)
        window.addEventListener('pointerup', this.pointerUp)
        window.addEventListener('pointercancel', this.pointerUp)
        document.addEventListener('visibilitychange', this.visibilityChange)
        this.resizeObserver = new ResizeObserver(() => this.resize())
        this.resizeObserver.observe(this.container)
        this.setState(this.state)
        this.resize()
    }

    resize() {
        if (!this.renderer || this.disposed) return
        const width = Math.max(1, this.container.clientWidth)
        const height = Math.max(1, this.container.clientHeight)
        this.renderer.setSize(width, height, false)
        this.camera.aspect = width / height
        const minimumDistance = 8.2 * Math.max(1, .86 / this.camera.aspect)
        const offset = this.camera.position.clone().sub(this.controls.target)
        if (offset.length() < minimumDistance) {
            offset.setLength(minimumDistance)
            this.camera.position.copy(this.controls.target).add(offset)
            this.controls.update()
        }
        this.camera.updateProjectionMatrix()
        this.draw()
    }

    setState(state) {
        this.state = state
        if (!this.root) return
        state.positions.forEach((position, piece) => {
            const coordinate = this.engine.COORDINATES[position]
            const orientation = this.engine.ORIENTATIONS[state.orientations[piece]]
            const cubie = this.cubies[piece]
            if (cubie.parent !== this.root) this.root.attach(cubie)
            cubie.position.set(coordinate[0] * 1.02, coordinate[1] * 1.02, coordinate[2] * 1.02)
            const matrix = new THREE.Matrix4().set(
                orientation[0], orientation[1], orientation[2], 0,
                orientation[3], orientation[4], orientation[5], 0,
                orientation[6], orientation[7], orientation[8], 0,
                0, 0, 0, 1,
            )
            cubie.quaternion.setFromRotationMatrix(matrix)
            cubie.updateMatrixWorld(true)
        })
        this.pivot.rotation.set(0, 0, 0)
        this.pivot.updateMatrixWorld(true)
        this.draw()
    }

    canvas() { return this.renderer?.domElement || null }
    isBusy() { return this.busy }
    setInputEnabled(enabled) { this.inputEnabled = Boolean(enabled) }

    setNdc(event) {
        const rect = this.renderer.domElement.getBoundingClientRect()
        this.ndc.set(
            (event.clientX - rect.left) / rect.width * 2 - 1,
            -(event.clientY - rect.top) / rect.height * 2 + 1,
        )
    }

    beginPointer(event) {
        if (event.button !== 0 || !event.isPrimary || this.busy || !this.inputEnabled) return
        this.setNdc(event)
        this.camera.updateMatrixWorld()
        this.raycaster.setFromCamera(this.ndc, this.camera)
        const hit = this.raycaster.intersectObjects(this.cubies, false)[0]
        if (!hit) return
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)
        const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize()
        const dominant = ['x', 'y', 'z'].reduce((best, axis) =>
            Math.abs(normal[axis]) > Math.abs(normal[best]) ? axis : best, 'x')
        normal.set(0, 0, 0)
        normal[dominant] = Math.sign(hit.face.normal.clone().applyMatrix3(normalMatrix)[dominant]) || 1
        this.drag = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            cubie: hit.object,
            point: hit.point.clone(),
            normal,
            axis: null,
            tangent: null,
            layer: null,
        }
        this.controls.enabled = false
        try { this.renderer.domElement.setPointerCapture(event.pointerId) } catch {}
        event.preventDefault()
        event.stopImmediatePropagation()
    }

    screenDirection(origin, direction) {
        const rect = this.renderer.domElement.getBoundingClientRect()
        const from = origin.clone().project(this.camera)
        const to = origin.clone().add(direction).project(this.camera)
        return new THREE.Vector2((to.x - from.x) * rect.width / 2, -(to.y - from.y) * rect.height / 2)
    }

    lockDrag(vector) {
        this.camera.updateMatrixWorld()
        let best = null
        for (const axis of ['x', 'y', 'z'].filter(axis => Math.abs(this.drag.normal[axis]) < .5)) {
            const tangent = this.screenDirection(
                this.drag.point,
                new THREE.Vector3().crossVectors(AXIS_VECTOR[axis], this.drag.normal),
            )
            if (tangent.lengthSq() < .0001) continue
            tangent.normalize()
            const score = Math.abs(vector.dot(tangent))
            if (!best || score > best.score) best = {axis, tangent, score}
        }
        if (!best) return false
        this.drag.axis = best.axis
        this.drag.tangent = best.tangent
        const position = this.engine.COORDINATES[this.state.positions[this.drag.cubie.userData.piece]]
        this.drag.layer = position[{x: 0, y: 1, z: 2}[best.axis]]
        this.mountLayer(best.axis, this.drag.layer)
        return true
    }

    movePointer(event) {
        if (!this.drag || event.pointerId !== this.drag.id || this.busy) return
        const vector = new THREE.Vector2(event.clientX - this.drag.startX, event.clientY - this.drag.startY)
        if (!this.drag.axis && (vector.length() < 7 || !this.lockDrag(vector))) return
        const rect = this.renderer.domElement.getBoundingClientRect()
        const sensitivity = HALF_PI / Math.max(96, Math.min(rect.width, rect.height) * .38)
        this.pivot.rotation[this.drag.axis] = THREE.MathUtils.clamp(
            vector.dot(this.drag.tangent) * sensitivity,
            -Math.PI,
            Math.PI,
        )
        this.draw()
    }

    endPointer(event) {
        if (!this.drag || event.pointerId !== this.drag.id) return
        const drag = this.drag
        this.drag = null
        this.controls.enabled = true
        try { this.renderer.domElement.releasePointerCapture(event.pointerId) } catch {}
        if (!drag.axis) return
        const turns = THREE.MathUtils.clamp(Math.round(this.pivot.rotation[drag.axis] / HALF_PI), -2, 2)
        this.finishLayer({axis: drag.axis, layer: drag.layer, turns}, 190)
    }

    mountLayer(axis, layer) {
        this.pivot.rotation.set(0, 0, 0)
        const axisIndex = {x: 0, y: 1, z: 2}[axis]
        this.state.positions.forEach((position, piece) => {
            if (this.engine.COORDINATES[position][axisIndex] === layer) this.pivot.attach(this.cubies[piece])
        })
    }

    tweenRotation(axis, target, duration) {
        const start = this.pivot.rotation[axis]
        if (duration <= 0) {
            this.pivot.rotation[axis] = target
            this.draw()
            return Promise.resolve()
        }
        return new Promise(resolve => {
            const started = performance.now()
            const step = time => {
                if (this.disposed) return resolve()
                const progress = Math.min(1, (time - started) / duration)
                this.pivot.rotation[axis] = THREE.MathUtils.lerp(start, target, easeInOut(progress))
                this.draw()
                if (progress < 1) this.animationFrame = requestAnimationFrame(step)
                else {
                    this.animationFrame = null
                    resolve()
                }
            }
            this.animationFrame = requestAnimationFrame(step)
        })
    }

    async finishLayer(move, duration, commit = true) {
        this.busy = true
        await this.tweenRotation(move.axis, move.turns * HALF_PI, duration)
        for (const cubie of [...this.pivot.children]) this.root.attach(cubie)
        this.pivot.rotation.set(0, 0, 0)
        this.busy = false
        if (move.turns) {
            const next = commit ? this.onTurn?.(move) : this.engine.turn(this.state, move)
            if (next) this.setState(next)
        } else {
            this.setState(this.state)
        }
    }

    async animateTurn(move, duration = 120, commit = true) {
        if (this.busy || !this.renderer) return false
        this.mountLayer(move.axis, move.layer)
        await this.finishLayer(move, duration, commit)
        return true
    }

    draw() {
        if (!this.renderer || this.disposed || document.hidden) return
        this.renderer.render(this.scene, this.camera)
    }

    dispose() {
        this.disposed = true
        cancelAnimationFrame(this.animationFrame)
        this.resizeObserver?.disconnect()
        window.removeEventListener('pointermove', this.pointerMove)
        window.removeEventListener('pointerup', this.pointerUp)
        window.removeEventListener('pointercancel', this.pointerUp)
        document.removeEventListener('visibilitychange', this.visibilityChange)
        this.controls?.dispose()
        this.geometry?.dispose()
        this.bodyMaterial?.dispose()
        this.faceMaterials?.forEach(material => material.dispose())
        this.textures?.forEach(texture => texture.dispose())
        this.renderer?.dispose()
        this.renderer?.domElement.remove()
    }
}

globalThis.OfflineGames = Object.assign(globalThis.OfflineGames || {}, {Rubiks3D: {RubiksStage}})
