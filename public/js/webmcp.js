/* Influencer Butler — WebMCP shim
 * Registers a small set of marketing-tier tools on window.mcp so that
 * in-browser AI agents (Claude in Chrome, etc.) can interact with the site.
 * Spec: https://github.com/jasonjmcghee/WebMCP (W3C WebMCP CG draft) — emerging.
 */
(function () {
  if (typeof window === "undefined") return;

  if (!("mcp" in window)) {
    window.mcp = {
      version: "0.1",
      tools: new Map(),
      registerTool: function (def, handler) {
        if (!def || typeof def.name !== "string") return;
        this.tools.set(def.name, { def: def, handler: handler });
      },
      callTool: async function (name, args) {
        var entry = this.tools.get(name);
        if (!entry) throw new Error("Unknown tool: " + name);
        return entry.handler(args || {});
      },
      listTools: function () {
        var out = [];
        this.tools.forEach(function (entry) { out.push(entry.def); });
        return out;
      },
    };
  }

  var mcp = window.mcp;

  mcp.registerTool(
    {
      name: "navigate_to_feature",
      description: "Navigate the browser to a specific Influencer Butler feature page.",
      inputSchema: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Feature slug, e.g. 'amazon-butler', 'instagram-butler'.",
          },
        },
        required: ["slug"],
      },
    },
    function (args) {
      var slug = String(args.slug || "").replace(/[^a-z0-9-]/gi, "");
      if (!slug) throw new Error("slug required");
      window.location.href = "/features/" + slug;
      return { ok: true, url: "/features/" + slug };
    }
  );

  mcp.registerTool(
    {
      name: "get_pricing",
      description: "Return the public pricing tiers for Influencer Butler.",
      inputSchema: { type: "object", properties: {} },
    },
    async function () {
      var res = await fetch("/api/pricing-public", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("pricing fetch failed: " + res.status);
      return await res.json();
    }
  );

  mcp.registerTool(
    {
      name: "start_signup",
      description: "Send the user to the signup page to start a new Influencer Butler account.",
      inputSchema: { type: "object", properties: {} },
    },
    function () {
      window.location.href = "/signup";
      return { ok: true, url: "/signup" };
    }
  );

  mcp.registerTool(
    {
      name: "request_demo",
      description: "Open the homepage with a demo request flag so the demo CTA is highlighted.",
      inputSchema: { type: "object", properties: {} },
    },
    function () {
      window.location.href = "/?demo=1";
      return { ok: true, url: "/?demo=1" };
    }
  );

  try {
    document.dispatchEvent(new CustomEvent("webmcp:ready", { detail: { count: mcp.tools.size } }));
  } catch (_) { /* ignore */ }
})();
