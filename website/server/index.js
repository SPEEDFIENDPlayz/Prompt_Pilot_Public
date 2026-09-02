// Cloudflare Worker entry used by gpt-sites to serve the Vite-built PWA.
export default {
  async fetch(request, env) {
    // gpt-sites mounts the uploaded `dist` directory as the asset root. The
    // Vite client is intentionally kept under `dist/client`, so route public
    // requests into that directory without exposing the build layout.
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? "/client/index.html" : `/client${url.pathname}`;
    url.pathname = pathname;
    let response = await env.ASSETS.fetch(new Request(url, request));
    if (response.status === 404 && request.method === "GET" && (request.headers.get("Accept") || "").includes("text/html")) {
      url.pathname = "/client/index.html";
      response = await env.ASSETS.fetch(new Request(url, request));
    }
    return response;
  },
};
