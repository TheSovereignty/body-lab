import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { Conversation } from "https://cdn.jsdelivr.net/npm/@elevenlabs/client@0.14.0/+esm";

const button = document.querySelector("#orb");
const canvas = document.querySelector("#orb-canvas");
const stateLabel = document.querySelector("#state");

const states = ["resting", "connecting", "listening", "thinking", "speaking", "returning"];
let stateIndex = 0;
let currentState = "resting";
let previousState = "resting";
let stateTransition = 1;
const stateTransitionDuration = 2.4;
const speakingEntranceDuration = 1.8;
let returnTimer;
let conversation = null;
let conversationStatus = "disconnected";
let voiceEnergy = 0;

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
camera.position.set(0, 0, 8.4);

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

// Rings: two complete circular orbits around the ORB.
// They are independent of the sphere's surface and remain visibly separate.
const ringGroups = [
  makeRing(1.28, 0.72, 0.00),
  makeRing(1.50, 0.44, 0.0)
];

function makeRing(radius, baseOpacity, phaseOffset) {
  const count = 720;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * radius;
    positions[i * 3 + 1] = Math.sin(a) * radius;
    positions[i * 3 + 2] = 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: 0x9afff5,
    transparent: true,
    opacity: baseOpacity,
    depthTest: false,
    depthWrite: false
  });

  const line = new THREE.LineLoop(geometry, material);
  line.renderOrder = 10;
  line.userData = { count, radius, baseOpacity, phaseOffset };
  root.add(line);
  return line;
}

function updateRing(line, time, ringIndex) {
  const { count, radius, baseOpacity, phaseOffset } = line.userData;
  const positions = line.geometry.attributes.position.array;
  const speaking = getVisualAmount("speaking") > 0.01;

  // Preserve the successful localized vibration, but never break the closed loop.
  const wavePhase = time * (1.15 + ringIndex * 0.22) + ringIndex * 2.6;
  const packetCenter = ((wavePhase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const strength = speaking
    ? 0.018 + Math.min(0.034, voiceEnergy * 0.00010)
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
    const r = radius * (1.0 + wave + secondary);

    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = Math.sin(a) * r;
    positions[i * 3 + 2] = 0;
  }

  line.geometry.attributes.position.needsUpdate = true;

  // Breath cascades outward from the body: body → inner ring → outer ring.
  // The phase offsets are deliberately large enough to read as a sequence.
  const breathPeriod = 7;
  const cascadeDelay = 0.95;
  const breath = 0.5 + 0.5 * Math.sin(
    time * (Math.PI * 2 / breathPeriod) -
    (ringIndex + 1) * cascadeDelay * (Math.PI * 2 / breathPeriod)
  );

  const stateExpansion =
    getVisualValue("listening", 0.035) +
    getVisualValue("thinking", 0.075) +
    getVisualValue("speaking", 0.12) +
    getVisualValue("returning", 0.055);

  const speakingAmount = getSpeakingVisualAmount(time);
  const ringScale =
    1.0 +
    stateExpansion +
    breath * 0.14 +
    speakingAmount * 0.028 * (0.5 + 0.5 * Math.sin(time * 5.2 + ringIndex));

  line.scale.set(ringScale, ringScale, 1);

  const targetOpacity = baseOpacity * (0.82 + breath * 0.22);
  line.material.opacity = targetOpacity + speakingAmount * 0.08;
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

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function getVisualAmount(state) {
  const t = smoothstep(Math.min(1, stateTransition / stateTransitionDuration));
  const from = previousState === state ? 1 : 0;
  const to = currentState === state ? 1 : 0;
  return THREE.MathUtils.lerp(from, to, t);
}

function getVisualValue(state, value) {
  return value * getVisualAmount(state);
}

function getSpeakingVisualAmount(time) {
  if (currentState === "speaking" && previousState === "listening") {
    return smoothstep(Math.min(1, (time - stateStarted) / speakingEntranceDuration));
  }
  if (currentState === "speaking") {
    return getVisualAmount("speaking");
  }
  return 0;
}

function setState(next) {
  clearTimeout(returnTimer);
  if (next !== currentState) {
    // Listening → speaking is a continuous arrival, not a new state animation.
    // Keep the listening visual in place while speaking-specific behavior eases in.
    if (currentState !== "listening" || next !== "speaking") {
      previousState = currentState;
      stateTransition = 0;
    }
  }
  currentState = next;
  stateIndex = states.indexOf(next);
  stateStarted = clock.getElapsedTime();
  button.dataset.state = next;
  button.setAttribute("aria-label",
    next === "resting" ? "Touch ORB to begin" :
    next === "connecting" ? "Connecting to ORB" :
    next === "returning" ? "ORB is returning" :
    "Touch ORB to end the conversation"
  );
  stateLabel.textContent = next;
  stateLabel.style.color = next === "resting"
    ? "rgba(220, 255, 248, .38)"
    : "rgba(220, 255, 248, .72)";

  if (next === "returning") {
    returnTimer = setTimeout(() => setState("resting"), 5200);
  }
}

async function startConversation() {
  if (conversation) return;

  setState("connecting");

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });

    conversation = await Conversation.startSession({
      agentId: "agent_1501kw5m24g5fqz9k547ztzen171",

      onConnect: () => {
        conversationStatus = "connected";
        setState("listening");
      },

      onDisconnect: () => {
        conversationStatus = "disconnected";
        conversation = null;
        voiceEnergy = 0;
        setState("returning");
      },

      onError: (error) => {
        console.error("ORB conversation error:", error);
        conversationStatus = "disconnected";
        conversation = null;
        voiceEnergy = 0;
        setState("returning");
      },

      onStatusChange: ({ status }) => {
        conversationStatus = status;
        if (status === "connecting") setState("connecting");
      },

      onModeChange: ({ mode }) => {
        if (mode === "speaking") {
          setState("speaking");
        } else if (mode === "listening") {
          setState("listening");
        }
      }
    });
  } catch (error) {
    console.error("ORB could not start conversation:", error);
    conversationStatus = "disconnected";
    conversation = null;
    voiceEnergy = 0;
    setState("returning");
  }
}

async function endConversation() {
  if (!conversation) return;
  const activeConversation = conversation;
  conversation = null;
  conversationStatus = "disconnected";
  voiceEnergy = 0;
  try {
    await activeConversation.endSession();
  } catch (error) {
    console.error("ORB could not end conversation:", error);
  }
  setState("returning");
}

button.addEventListener("click", async () => {
  if (conversationStatus === "connected") {
    await endConversation();
  } else if (conversationStatus === "disconnected") {
    await startConversation();
  }
});

button.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (conversationStatus === "connected") {
      await endConversation();
    } else if (conversationStatus === "disconnected") {
      await startConversation();
    }
  }
});

function resize() {
  const rect = canvas.getBoundingClientRect();
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

  if (stateTransition < stateTransitionDuration) {
    stateTransition += 1 / 60;
  }

  // Physical body: one breathing volume, not layered DOM circles.
  let scale = 0.94 + breath * 0.06;
  const speakingAmount = getSpeakingVisualAmount(time);
  if (speakingAmount > 0.01) {
    const voicePulse = 0.5 + 0.5 * Math.sin(time * 5.2) * (0.5 + 0.5 * Math.sin(time * 2.1));
    scale += speakingAmount * voicePulse * 0.006;
  }
  root.scale.setScalar(scale);

  const targetFocus = focusForState(time);
  const focusLerp = currentState === "speaking" && previousState !== "listening" ? 0.028 : 0.045;
  orbMaterial.uniforms.uFocus.value.lerp(targetFocus, focusLerp);

  if (conversation && speakingAmount > 0.5) {
    const output = conversation.getOutputByteFrequencyData();
    if (output && output.length) {
      let sum = 0;
      for (let i = 0; i < output.length; i++) {
        sum += output[i] * output[i];
      }
      const rms = Math.sqrt(sum / output.length);
      voiceEnergy += (rms - voiceEnergy) * 0.28;
    }
  } else {
    voiceEnergy *= 0.86;
  }

  const speakingVisual = speakingAmount;
  const listeningVisual = currentState === "speaking" && previousState === "listening"
    ? 1
    : getVisualAmount("listening");
  const thinkingVisual = getVisualAmount("thinking");
  const targetEnergy =
    speakingVisual * (0.30 + Math.min(0.42, voiceEnergy / 170)) +
    listeningVisual * 0.07 +
    thinkingVisual * 0.12;

  orbMaterial.uniforms.uEnergy.value +=
    (targetEnergy - orbMaterial.uniforms.uEnergy.value) * 0.06;
  orbMaterial.uniforms.uBreath.value = breath;
  orbMaterial.uniforms.uTime.value = time;

  halo.material.opacity = 0.045 + breath * 0.025 + orbMaterial.uniforms.uEnergy.value * 0.045;

  ringGroups.forEach((ring, i) => updateRing(ring, time, i));

  renderer.render(scene, camera);
}

animate();
