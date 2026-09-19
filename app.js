import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const button = document.querySelector("#orb");
const canvas = document.querySelector("#orb-canvas");
const stateLabel = document.querySelector("#state");

const states = ["resting", "listening", "thinking", "speaking", "returning"];
let stateIndex = 0;
let currentState = "resting";
let returnTimer;

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
camera.position.set(0, 0, 4.2);

const clock = new THREE.Clock();
const root = new THREE.Group();
scene.add(root);

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  uniform vec3 uFocus;
  uniform float uEnergy;
  uniform float uBreath;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  varying vec3 vPosition;

  void main() {
    vec3 n = normalize(vNormal);

    // The focal light is part of the sphere's color field, never a separate object.
    vec3 focus = normalize(uFocus);
    float focusDot = max(dot(n, focus), 0.0);
    float goldField = pow(focusDot, 13.0);
    float goldHalo = pow(focusDot, 3.6);

    float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 2.0);
    float softDrift = 0.5 + 0.5 * sin(uTime * 0.22 + vPosition.y * 2.1);

    vec3 cyan = vec3(0.18, 0.96, 0.96);
    vec3 emerald = vec3(0.02, 0.82, 0.52);
    vec3 gold = vec3(1.00, 0.78, 0.28);

    // Keep the body unmistakably present. The focus changes the field; it does not
    // replace the body with a tiny floating light.
    vec3 body = mix(cyan, emerald, 0.34 + 0.16 * softDrift);
    body = mix(body, cyan, rim * 0.58);
    body = mix(body, gold, goldHalo * 0.42);
    body = mix(body, gold, goldField);

    float facing = max(dot(n, vec3(-0.18, 0.22, 0.96)), 0.0);
    float surface = 0.72 + 0.38 * facing;
    float brightness = surface * (1.10 + uEnergy * 0.72 + uBreath * 0.10);

    gl_FragColor = vec4(body * brightness, 1.0);
  }
`;

const orbMaterial = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uFocus: { value: new THREE.Vector3(0.24, 0.27, 1).normalize() },
    uEnergy: { value: 0.0 },
    uBreath: { value: 0.0 },
    uTime: { value: 0.0 }
  },
  transparent: true
});

const orbMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1.0, 96, 96),
  orbMaterial
);
root.add(orbMesh);

// A soft atmospheric halo behind the volume.
const halo = new THREE.Mesh(
  new THREE.SphereGeometry(1.03, 48, 48),
  new THREE.MeshBasicMaterial({
    color: 0x20d69a,
    transparent: true,
    opacity: 0.055,
    side: THREE.BackSide
  })
);
root.add(halo);

// Rings: rebuilt as simple, continuous front-facing elliptical loops.
// They live outside the orb's body and carry the same localized vibration,
// while their overall scale breathes with the ORB.
const ringGroups = [
  makeRing(1.18, 0.10, 0.72),
  makeRing(1.30, 0.08, 0.44)
];

function makeRing(radius, z, baseOpacity) {
  const count = 512;
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({
    color: 0x9afff5,
    transparent: true,
    opacity: baseOpacity,
    depthTest: false,
    depthWrite: false
  });

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const line = new THREE.LineLoop(geometry, material);
  line.renderOrder = 10;
  line.userData = { count, radius, z, baseOpacity };
  root.add(line);
  return line;
}

function updateRing(line, time, ringIndex) {
  const { count, radius, z, baseOpacity } = line.userData;
  const positions = line.geometry.attributes.position.array;
  const speaking = currentState === "speaking";

  // Preserve the successful tight traveling vibration from the previous build.
  const wavePhase = time * (1.15 + ringIndex * 0.22) + ringIndex * 2.6;
  const packetCenter = ((wavePhase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const strength = speaking
    ? (0.020 + 0.018 * (0.5 + 0.5 * Math.sin(time * 4.7 + ringIndex)))
    : 0;

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const delta = Math.atan2(
      Math.sin(a - packetCenter),
      Math.cos(a - packetCenter)
    );
    const packet = Math.exp(-(delta * delta) / 0.030);
    const wave = Math.sin(delta * 30.0 - time * 12.0) * packet * strength;
    const secondary = Math.sin(delta * 14.0 + time * 7.0) * packet * strength * 0.16;
    const r = 1.0 + wave + secondary;

    positions[i * 3] = Math.cos(a) * radius * r;
    positions[i * 3 + 1] = Math.sin(a) * radius * r;
    positions[i * 3 + 2] = z;
  }

  line.geometry.attributes.position.needsUpdate = true;

  // The rings breathe independently of the orb's surface, giving them
  // visible space and a clear relationship to the body's own breathing.
  const breath = 0.5 + 0.5 * Math.sin(
    time * (Math.PI * 2 / 7) + ringIndex * 0.38
  );
  const stateExpansion =
    currentState === "listening" ? 0.035 :
    currentState === "thinking" ? 0.075 :
    currentState === "speaking" ? 0.12 :
    currentState === "returning" ? 0.055 :
    0.0;

  const ringScale =
    1.0 +
    stateExpansion +
    breath * 0.045 +
    (speaking
      ? 0.028 * (0.5 + 0.5 * Math.sin(time * 5.2 + ringIndex))
      : 0);

  line.scale.set(ringScale, ringScale, 1);

  const targetOpacity = baseOpacity * (0.82 + breath * 0.22);
  line.material.opacity = speaking
    ? targetOpacity + 0.08
    : targetOpacity;
}

function focusForState(time) {
  const resting = new THREE.Vector3(0.24, 0.27, 1).normalize();

  if (currentState === "resting" || currentState === "returning") {
    if (currentState === "returning") {
      const p = Math.min(1, (time - stateStarted) / 4.5);
      return resting.clone().lerp(new THREE.Vector3(0, 0, 1), 1 - p).normalize();
    }
    return resting;
  }

  if (currentState === "listening") {
    // Slow, irregular attention shifts: the whole light field follows.
    const x = 0.24 + Math.sin(time * 0.47) * 0.19 + Math.sin(time * 0.19 + 1.7) * 0.12;
    const y = 0.27 + Math.sin(time * 0.61 + 0.8) * 0.14 + Math.sin(time * 0.31) * 0.08;
    return new THREE.Vector3(x, y, 1).normalize();
  }

  // Thinking and speaking bring attention inward.
  return new THREE.Vector3(0, 0, 1);
}

let stateStarted = 0;

function setState(next) {
  clearTimeout(returnTimer);
  currentState = next;
  stateIndex = states.indexOf(next);
  stateStarted = clock.getElapsedTime();
  button.dataset.state = next;
  stateLabel.textContent = next;
  stateLabel.style.color = next === "resting"
    ? "rgba(220, 255, 248, .38)"
    : "rgba(220, 255, 248, .72)";

  if (next === "returning") {
    returnTimer = setTimeout(() => setState("resting"), 5200);
  }
}

function advanceState() {
  setState(states[(stateIndex + 1) % states.length]);
}

button.addEventListener("click", advanceState);
button.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    advanceState();
  }
});

function resize() {
  const rect = button.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();
setState("resting");

function animate() {
  requestAnimationFrame(animate);

  const time = clock.getElapsedTime();
  const breath = 0.5 + 0.5 * Math.sin(time * (Math.PI * 2 / 7) - Math.PI / 2);

  // Physical body: one breathing volume, not layered DOM circles.
  let scale = 0.94 + breath * 0.06;
  if (currentState === "speaking") {
    const voicePulse = 0.5 + 0.5 * Math.sin(time * 5.2) * (0.5 + 0.5 * Math.sin(time * 2.1));
    scale += voicePulse * 0.006;
  }
  root.scale.setScalar(scale);

  const targetFocus = focusForState(time);
  orbMaterial.uniforms.uFocus.value.lerp(targetFocus, 0.045);

  const targetEnergy =
    currentState === "speaking"
      ? 0.35 + 0.28 * (0.5 + 0.5 * Math.sin(time * 5.0)) + 0.12 * (0.5 + 0.5 * Math.sin(time * 2.2))
      : currentState === "listening"
        ? 0.07
        : currentState === "thinking"
          ? 0.12
          : 0.0;

  orbMaterial.uniforms.uEnergy.value +=
    (targetEnergy - orbMaterial.uniforms.uEnergy.value) * 0.06;
  orbMaterial.uniforms.uBreath.value = breath;
  orbMaterial.uniforms.uTime.value = time;

  halo.material.opacity = 0.045 + breath * 0.025 + orbMaterial.uniforms.uEnergy.value * 0.045;

  ringGroups.forEach((ring, i) => updateRing(ring, time, i));

  renderer.render(scene, camera);
}

animate();
