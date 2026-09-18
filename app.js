const orb = document.querySelector("#orb");
const state = document.querySelector("#state");

let active = false;

orb.addEventListener("click", () => {
  active = !active;
  orb.classList.toggle("active", active);
  state.textContent = active ? "listening" : "resting";
  state.style.color = active
    ? "rgba(220, 255, 248, .72)"
    : "rgba(220, 255, 248, .38)";
});

orb.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    orb.click();
  }
});