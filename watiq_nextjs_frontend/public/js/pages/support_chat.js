(function () {
  "use strict";

  var yearEl = document.getElementById("current-year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var form = document.querySelector("main form");
  var chatContainer = document.getElementById("chat-container");
  var textarea = document.getElementById("chat-message");

  if (!form || !chatContainer || !textarea) return;

  function appendMessage(text, isUser) {
    var wrapper = document.createElement("div");
    wrapper.className = "flex gap-4 max-w-[80%]" + (isUser ? " self-end flex-row-reverse" : "");

    var iconBox = document.createElement("div");
    iconBox.className = "w-8 h-8 rounded-full overflow-hidden shrink-0 mt-1 bg-primary-container flex items-center justify-center";
    var icon = document.createElement("span");
    icon.className = "material-symbols-outlined text-on-primary text-[18px]";
    icon.textContent = isUser ? "person" : "support_agent";
    iconBox.appendChild(icon);

    var bubble = document.createElement("div");
    bubble.className = (isUser ? "bg-primary-container text-on-primary rounded-2xl rounded-se-sm" : "bg-surface-container-highest text-on-surface rounded-2xl rounded-ss-sm") + " p-4 shadow-sm border border-outline-variant/30";
    
    var p = document.createElement("p");
    p.className = "font-body-md text-body-md";
    p.textContent = text;
    
    var time = document.createElement("span");
    time.className = "font-support-sm text-support-sm text-outline mt-2 block text-end";
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    bubble.appendChild(p);
    bubble.appendChild(time);

    wrapper.appendChild(iconBox);
    wrapper.appendChild(bubble);

    chatContainer.appendChild(wrapper);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function generateReply(userText) {
    var lower = userText.toLowerCase();
    if (lower.indexOf("cin") > -1 || lower.indexOf("identity") > -1 || lower.indexOf("carte") > -1) {
      return "To process National Identity Card (CIN) updates or renewals, please visit the Citizen Space dashboard or schedule an appointment with your local municipal office.";
    } else if (lower.indexOf("appointment") > -1 || lower.indexOf("rdv") > -1 || lower.indexOf("slot") > -1) {
      return "You can view available time slots and book an appointment directly under the 'Book Appointment' section on the portal.";
    } else if (lower.indexOf("document") > -1 || lower.indexOf("certificate") > -1 || lower.indexOf("b3") > -1) {
      return "Document verification and request status can be tracked anytime using your tracking code or under 'My Documents' in your dashboard.";
    } else if (lower.indexOf("hello") > -1 || lower.indexOf("hi") > -1 || lower.indexOf("bonjour") > -1) {
      return "Greetings! Welcome to Watiq Sovereign Portal Support. How can I assist you with your administrative procedures today?";
    } else {
      return "Thank you for your message. Your inquiry has been registered with Watiq Institutional Support (Ticket #" + Math.floor(100000 + Math.random() * 900000) + "). An agent is actively reviewing your request.";
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = textarea.value.trim();
    if (!text) return;
    
    appendMessage(text, true);
    textarea.value = "";

    setTimeout(function () {
      var reply = generateReply(text);
      appendMessage(reply, false);
    }, 500);
  });
})();
