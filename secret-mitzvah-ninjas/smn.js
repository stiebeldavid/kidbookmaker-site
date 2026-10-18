/* Secret Mitzvah Ninjas order page */
(function () {
  "use strict";

  // ===== STRIPE PAYMENT LINK: paste the link from Stripe here (one line). =====
  // Empty = the button stays disabled and reads "Ordering opens shortly".
  var STRIPE_PAYMENT_LINK = "";
  // ===========================================================================

  var btn = document.getElementById("order-btn");
  if (btn && /^https:\/\//.test(STRIPE_PAYMENT_LINK)) {
    btn.href = STRIPE_PAYMENT_LINK;
    btn.textContent = btn.getAttribute("data-ready-label") || "Order now";
    btn.removeAttribute("aria-disabled");
  } else if (btn) {
    btn.addEventListener("click", function (e) { e.preventDefault(); });
  }

  // Thank-you banner after Stripe redirects back with ?ordered=1
  var params = new URLSearchParams(window.location.search);
  var thanks = document.getElementById("thanks");
  if (thanks && params.get("ordered") === "1") {
    thanks.hidden = false;
    var close = document.getElementById("thanks-close");
    if (close) close.addEventListener("click", function () {
      thanks.hidden = true;
      if (window.history && history.replaceState) history.replaceState(null, "", window.location.pathname);
    });
  }

  // Simple tap-to-enlarge gallery
  var lb = document.getElementById("lightbox");
  var lbImg = document.getElementById("lb-img");
  function closeLb() { lb.hidden = true; lbImg.removeAttribute("src"); document.documentElement.style.overflow = ""; }
  if (lb && lbImg) {
    Array.prototype.forEach.call(document.querySelectorAll(".gal-item"), function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var img = a.querySelector("img");
        lbImg.src = a.getAttribute("href");
        lbImg.alt = img ? img.alt : "";
        lb.hidden = false;
        document.documentElement.style.overflow = "hidden";
      });
    });
    lb.addEventListener("click", closeLb);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !lb.hidden) closeLb(); });
  }
})();
