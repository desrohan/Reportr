// Runs in MAIN world to overwrite window globals before the page loads.
(function () {
  // ─── Fetch ────────────────────────────────────────────────────────
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const startTime = Date.now();
    const input = args[0];
    const init = (args[1] || {}) as RequestInit;

    const url = input instanceof Request ? input.url : String(input || '');
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    // Request headers
    const requestHeaders: Record<string, string> = {};
    try {
      const h = new Headers(init.headers || (input instanceof Request ? input.headers : {}));
      h.forEach((v, k) => { requestHeaders[k] = v; });
    } catch (_) {}

    // Request body
    let requestBody = '';
    try {
      if (typeof init.body === 'string') requestBody = init.body.slice(0, 5000);
      else if (init.body instanceof URLSearchParams) requestBody = init.body.toString().slice(0, 5000);
      else if (init.body) requestBody = '[binary]';
    } catch (_) {}

    try {
      const response = await originalFetch.apply(this, args);
      const clone = response.clone();

      // Response headers
      const responseHeaders: Record<string, string> = {};
      try { response.headers.forEach((v, k) => { responseHeaders[k] = v; }); } catch (_) {}

      const contentType = response.headers.get('content-type') || '';
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      const body = await clone.text().catch(() => '');
      const size = contentLength || body.length;

      window.postMessage({
        type: 'reportr_network',
        detail: {
          type: 'fetch', url, method,
          status: response.status,
          duration: Date.now() - startTime,
          size, contentType,
          requestHeaders, requestBody,
          responseHeaders,
          responseBody: body.substring(0, 5000),
        }
      }, '*');
      return response;
    } catch (err) {
      window.postMessage({
        type: 'reportr_network',
        detail: {
          type: 'fetch', url, method,
          error: String(err),
          duration: Date.now() - startTime,
          requestHeaders, requestBody,
        }
      }, '*');
      throw err;
    }
  };

  // ─── XMLHttpRequest ───────────────────────────────────────────────
  const XHR = window.XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const originalSend = XHR.send;
  const originalSetHeader = XHR.setRequestHeader;

  // @ts-ignore
  XHR.open = function (...a: any[]) {
    (this as any)._rpt = {
      method: (a[0] || 'GET').toUpperCase(),
      url: String(a[1] || ''),
      reqHeaders: {} as Record<string, string>,
      startTime: 0,
      reqBody: '',
    };
    return originalOpen.apply(this, a as any);
  };

  // @ts-ignore
  XHR.setRequestHeader = function (name: string, value: string) {
    if ((this as any)._rpt) (this as any)._rpt.reqHeaders[name] = value;
    return originalSetHeader.apply(this, [name, value]);
  };

  // @ts-ignore
  XHR.send = function (body?: any) {
    if ((this as any)._rpt) {
      (this as any)._rpt.startTime = Date.now();
      (this as any)._rpt.reqBody = typeof body === 'string' ? body.slice(0, 5000) : body ? '[binary]' : '';
    }

    this.addEventListener('loadend', () => {
      const r = (this as any)._rpt;
      if (!r) return;

      const responseHeaders: Record<string, string> = {};
      try {
        (this.getAllResponseHeaders() || '').split('\r\n').forEach((line: string) => {
          const idx = line.indexOf(':');
          if (idx > 0) responseHeaders[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
        });
      } catch (_) {}

      const contentType = this.getResponseHeader('content-type') || '';
      const responseBody = (this.responseText || '').substring(0, 5000);
      const size = parseInt(this.getResponseHeader('content-length') || '0', 10) || responseBody.length;

      window.postMessage({
        type: 'reportr_network',
        detail: {
          type: 'xhr', url: r.url, method: r.method,
          status: this.status,
          duration: Date.now() - r.startTime,
          size, contentType,
          requestHeaders: r.reqHeaders,
          requestBody: r.reqBody,
          responseHeaders,
          responseBody,
        }
      }, '*');
    });

    return originalSend.apply(this, arguments as any);
  };

  // ─── Console ──────────────────────────────────────────────────────
  const methods = ['log', 'error', 'warn', 'info'] as const;
  methods.forEach((method) => {
    const original = console[method];
    console[method] = function (...args: any[]) {
      window.postMessage({
        type: 'reportr_console',
        detail: {
          level: method,
          message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
        }
      }, '*');
      original.apply(console, args);
    };
  });

  // ─── Clicks ───────────────────────────────────────────────────────
  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target) return;
    window.postMessage({
      type: 'reportr_click',
      detail: {
        tagName: target.tagName?.toLowerCase() ?? '',
        text: target.textContent?.trim().slice(0, 80) ?? '',
        outerHTML: target.outerHTML?.slice(0, 200) ?? '',
        id: target.id ?? '',
        className: target.className?.toString().slice(0, 80) ?? '',
        x: e.clientX, y: e.clientY,
      }
    }, '*');
  }, true);
})();
