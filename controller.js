
const WS_URL = "wss://3e1cb5a7eef5.ngrok-free.app ";
const gestureLayer = document.getElementById("gestureLayer");

const vibrationPatterns = {
  short_pulse: [0, 50],
  long_warning: [0, 200, 100, 200]
};

let socket = null;

// Shared state for gestures
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let lastTapTime = 0;

// Run after DOM is ready so #gestureLayer exists
document.addEventListener("DOMContentLoaded", () => {
  const gestureLayer = document.getElementById("gestureLayer");
  const statusEl = document.getElementById("status");
  const testFocusBtn = document.getElementById("testFocus");
  const testActivateBtn = document.getElementById("testActivate");

  if (!gestureLayer) {
    console.error("gestureLayer not found!");
    return;
  }

  // ---------------- FEEDBACK (Unity -> phone) ----------------

  function handleFeedback(msg) {
    console.log("Feedback from Unity:", msg);

    // TTS
    if ("speechSynthesis" in window && msg.tts) {
      const u = new SpeechSynthesisUtterance(msg.tts);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }

    // Vibration (no-op on iOS)
    if ("vibrate" in navigator && msg.vibrationProfileId) {
      const pattern = vibrationPatterns[msg.vibrationProfileId];
      if (pattern) navigator.vibrate(pattern);
    }
  }

  // Debug buttons
  if (testFocusBtn) {
    testFocusBtn.onclick = () => {
      handleFeedback({
        eventId: "menu_focus",
        tts: "START",
        speechProfileId: "Default",
        vibrationProfileId: "short_pulse",
        priority: 1
      });
    };
  }

  if (testActivateBtn) {
    testActivateBtn.onclick = () => {
      handleFeedback({
        eventId: "menu_activate",
        tts: "Selection confirmed",
        speechProfileId: "Default",
        vibrationProfileId: "long_warning",
        priority: 2
      });
    };
  }

  // ---------------- INPUT (phone -> Unity) ----------------

  function connectToUnity() {
    console.log("Connecting to Unity at", WS_URL);
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      console.log("Connected to Unity");
      if (statusEl) statusEl.textContent = "Connected to Unity.";

      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance("Phone connected.");
        window.speechSynthesis.speak(u);
      }
    };

    socket.onclose = () => {
      console.log("Disconnected from Unity, retrying soon...");
      if (statusEl) statusEl.textContent = "Disconnected. Reconnecting...";
      setTimeout(connectToUnity, 2000);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleFeedback(msg);
      } catch (e) {
        console.error("Bad JSON from Unity:", event.data);
      }
    };
  }

  function sendInputGesture(gesture) {
    console.log("Gesture detected:", gesture);

    const payload = {
      type: "input",
      gesture: gesture
    };

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }

    // Debug speech so you can hear gestures even if Unity is off
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(gesture.replace("_", " "));
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  }

  // ---------------- Gesture detection ----------------

  // Kill scroll in the layer
  gestureLayer.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );

  gestureLayer.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = Date.now();
    },
    { passive: true }
  );

  gestureLayer.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const dt = Date.now() - touchStartTime;

      const DIST = 40;
      let gesture = null;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > DIST) {
        gesture = dx > 0 ? "swipe_right" : "swipe_left";
      } else if (Math.abs(dy) > DIST) {
        gesture = dy > 0 ? "swipe_down" : "swipe_up";
      } else if (dt < 250) {
        const now = Date.now();
        if (now - lastTapTime < 300) {
          gesture = "double_tap";
          lastTapTime = 0;
        } else {
          gesture = "tap";
          lastTapTime = now;
        }
      }

      if (gesture) {
        sendInputGesture(gesture);
      }
    },
    { passive: true }
  );

  connectToUnity();
});