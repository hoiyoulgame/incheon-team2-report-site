(function () {
  var PIN = "2733";
  var KEY = "incheon-team2-report-auth";

  function isAuthed() {
    try {
      return window.sessionStorage.getItem(KEY) === "ok";
    } catch (error) {
      return false;
    }
  }

  function setAuthed() {
    try {
      window.sessionStorage.setItem(KEY, "ok");
    } catch (error) {
      return;
    }
  }

  if (isAuthed()) {
    return;
  }

  document.documentElement.classList.add("pin-locked");

  var style = document.createElement("style");
  style.textContent = [
    "html.pin-locked body > :not(.pin-gate){visibility:hidden!important;}",
    ".pin-gate{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#fff8fa,#f8e8ee);font-family:'Segoe UI','Malgun Gothic',Arial,sans-serif;color:#20171b;}",
    ".pin-card{width:min(420px,100%);padding:30px;border:1px solid rgba(165,0,52,.18);border-radius:10px;background:rgba(255,255,255,.94);box-shadow:0 24px 70px rgba(92,0,31,.16);}",
    ".pin-label{display:inline-flex;margin-bottom:14px;padding:6px 10px;border:1px solid rgba(165,0,52,.20);border-radius:7px;color:#a50034;font-size:12px;font-weight:900;}",
    ".pin-title{margin:0 0 8px;font-size:26px;line-height:1.2;font-weight:900;color:#710024;}",
    ".pin-copy{margin:0 0 20px;color:#70666a;font-size:13px;line-height:1.45;}",
    ".pin-row{display:grid;grid-template-columns:1fr auto;gap:8px;}",
    ".pin-input{width:100%;height:46px;border:1px solid #ead8df;border-radius:8px;padding:0 14px;font-size:20px;font-weight:900;letter-spacing:6px;text-align:center;outline:none;}",
    ".pin-input:focus{border-color:#a50034;box-shadow:0 0 0 3px rgba(165,0,52,.10);}",
    ".pin-button{height:46px;border:0;border-radius:8px;padding:0 16px;background:#252025;color:#fff;font-weight:900;cursor:pointer;}",
    ".pin-error{min-height:18px;margin:10px 0 0;color:#a50034;font-size:12px;font-weight:800;}",
    "@media(max-width:420px){.pin-card{padding:24px}.pin-row{grid-template-columns:1fr}.pin-button{width:100%}.pin-title{font-size:23px}}"
  ].join("");
  document.head.appendChild(style);

  function showGate() {
    if (document.querySelector(".pin-gate")) {
      return;
    }

    var gate = document.createElement("div");
    gate.className = "pin-gate";
    gate.innerHTML = [
      '<form class="pin-card" autocomplete="off">',
      '<div class="pin-label">PRIVATE REPORT</div>',
      '<h1 class="pin-title">인천2팀 Report Center</h1>',
      '<p class="pin-copy">공유받은 PIN 번호를 입력하면 리포트 메뉴로 이동합니다.</p>',
      '<div class="pin-row">',
      '<input class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" aria-label="PIN 번호" />',
      '<button class="pin-button" type="submit">입장하기</button>',
      '</div>',
      '<div class="pin-error" aria-live="polite"></div>',
      '</form>'
    ].join("");
    document.body.appendChild(gate);

    var form = gate.querySelector("form");
    var input = gate.querySelector(".pin-input");
    var error = gate.querySelector(".pin-error");

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (input.value === PIN) {
        setAuthed();
        document.documentElement.classList.remove("pin-locked");
        gate.remove();
        return;
      }
      error.textContent = "PIN 번호를 다시 확인해 주세요.";
      input.value = "";
      input.focus();
    });

    input.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showGate);
  } else {
    showGate();
  }
})();
