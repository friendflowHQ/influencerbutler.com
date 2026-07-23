/**
 * Live testimonials for the homepage "What Creators Are Saying" section.
 *
 * Fetches approved reviews from /api/testimonials/feed and, if any exist,
 * replaces the static placeholder cards inside .testimonial-grid with the real
 * ones (featured first, newest next). Uses the page's existing testimonial-*
 * classes so styling is unchanged. If the fetch fails or nothing is approved
 * yet, the static fallback cards are left in place. Fails silent.
 *
 * All customer-supplied text is inserted via textContent (never innerHTML) so a
 * review body can't inject markup.
 */
(function () {
  "use strict";

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function starsNode(rating) {
    var n = Math.max(1, Math.min(5, Math.round(rating || 5)));
    var wrap = el("div", "testimonial-stars");
    // Filled stars inherit the section's gold color; empties are muted.
    wrap.appendChild(document.createTextNode("★".repeat(n)));
    if (n < 5) {
      var empty = el("span");
      empty.style.color = "#d1d5db";
      empty.textContent = "★".repeat(5 - n);
      wrap.appendChild(empty);
    }
    return wrap;
  }

  function avatarNode(t) {
    var avatar = el("div", "testimonial-avatar");
    if (t.photoUrl) {
      var img = document.createElement("img");
      img.src = t.photoUrl;
      img.alt = "";
      img.loading = "lazy";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.borderRadius = "inherit";
      avatar.appendChild(img);
    } else {
      avatar.textContent = (t.name || "?").charAt(0).toUpperCase();
    }
    return avatar;
  }

  function cardNode(t) {
    var card = el("div", "testimonial-card anim-up");

    card.appendChild(starsNode(t.rating));

    var text = el("p", "testimonial-text");
    text.textContent = '"' + (t.body || "") + '"';
    card.appendChild(text);

    if (t.teamResponse) {
      var reply = el("div", "testimonial-reply");
      reply.style.marginTop = "12px";
      reply.style.paddingLeft = "12px";
      reply.style.borderLeft = "3px solid #f59e0b";
      reply.style.fontSize = "0.9em";
      reply.style.color = "#475569";
      var who = el("strong");
      who.textContent = "Influencer Butler team: ";
      reply.appendChild(who);
      reply.appendChild(document.createTextNode(t.teamResponse));
      card.appendChild(reply);
    }

    var author = el("div", "testimonial-author");
    author.appendChild(avatarNode(t));
    var meta = el("div");
    var name = el("strong");
    name.textContent = t.name || "Verified customer";
    meta.appendChild(name);
    if (t.role) {
      var role = el("span");
      role.textContent = t.role;
      meta.appendChild(role);
    }
    author.appendChild(meta);
    card.appendChild(author);

    return card;
  }

  function render(list) {
    var grid = document.querySelector(".testimonials .testimonial-grid");
    if (!grid) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < list.length; i++) {
      frag.appendChild(cardNode(list[i]));
    }
    grid.textContent = "";
    grid.appendChild(frag);
    // Let the carousel controller rebuild its pagination for the new cards.
    document.dispatchEvent(new CustomEvent("testimonials:rendered"));
  }

  function init() {
    fetch("/api/testimonials/feed", { headers: { accept: "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || data.enabled === false) return;
        var list = Array.isArray(data.testimonials) ? data.testimonials : [];
        if (list.length === 0) return; // keep static fallback cards
        render(list);
      })
      .catch(function () { /* keep static fallback */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
