const orb = document.querySelector("#orb");
const state = document.querySelector("#state");

const states = ["resting", "listening", "thinking", "speaking", "returning"];
let stateIndex = 0;
let returnTimer;

function setState(nextState) {
  clearTimeout(returnTimer);
  stateIndex = states.indexOf(nextState);
  orb.dataset.state = nextState;
  orb.classList.toggle("active", nextState === "speaking");
  state.textContent = nextState;
  state.style.color = nextState === "resting"
    ? "rgba(220, 255, 248, .38)"
    : "rgba(220, 255, 248, .72)";

  if (nextState === "returning") {
    returnTimer = setTimeout(() => setState("resting"), 5200);
  }
}

function advanceState() {
  const nextIndex = (stateIndex + 1) % states.length;
  setState(states[nextIndex]);
}

orb.addEventListener("click", advanceState);

orb.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    advanceState();
  }
});

setState("resting");