/*
 * proxy.js — 代理「透明拦截」前端侧
 * ------------------------------------------------------------
 * 三种代理来源（按顺序探测 /health，取第一个可用）：
 *   1. 本机 dev server：location.origin（本地起 local-server.js 时）
 *   2. 独立本机代理：http://localhost:3000
 *   3. 远程云函数代理：从 URL hash #proxy=<URL> 或 localStorage.remoteProxyUrl 读取
 *        —— 用于已部署到 Cloudflare Worker / 腾讯云 SCF 等云端的代理
 *
 * 行为：把对 api.deepseek.com / api.kkdmx.com / apihub.agnes-ai.com 的聊天请求
 *       重路由到代理并剥离 Authorization（key 只留在代理侧）。
 * 安全：本文件只做「请求重路由」，不藏任何 key。
 * 兼容：若所有代理都不可用（如直接打开 GitHub Pages 且没配远程代理），
 *       自动回退为原始直连逻辑。
 */
(function () {
  'use strict';
  var REAL_FETCH = window.fetch ? window.fetch.bind(window) : null;
  if (!REAL_FETCH) return; // 极老环境不支持 fetch，直接跳过

  // 仅这几个「已知上游」会被拦截并重路由；其它地址（含自定义 API）保持直连
  var PROXY_HOSTS = ['api.deepseek.com', 'api.kkdmx.com', 'apihub.agnes-ai.com'];

  // 解析远程代理 URL：优先 URL hash #proxy=<encoded URL>，其次 localStorage
  function getRemoteProxy() {
    try {
      var m = location.hash && location.hash.match(/proxy=([^&]+)/);
      if (m) {
        var u = decodeURIComponent(m[1]);
        try { localStorage.setItem('remoteProxyUrl', u); } catch (e) {}
        return u;
      }
    } catch (e) {}
    try { return localStorage.getItem('remoteProxyUrl') || ''; } catch (e) { return ''; }
  }

  var CANDIDATES = [];
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    CANDIDATES.push(location.origin); // 本机 dev server
  }
  CANDIDATES.push('http://localhost:3000'); // 独立本机代理
  var REMOTE = getRemoteProxy();
  if (REMOTE) CANDIDATES.push(REMOTE); // 远程云函数代理

  // 顺序探测，返回第一个 /health 可用的 base（或 null）
  var probePromise = CANDIDATES.reduce(function (chain, base) {
    return chain.then(function (found) {
      if (found) return found;
      return REAL_FETCH(base + '/health', { method: 'GET' })
        .then(function (r) { return r.ok ? base : null; })
        .catch(function () { return null; });
    });
  }, Promise.resolve(null));
  window.__PROXY_PROMISE__ = probePromise;

  window.fetch = function (input, init) {
    init = init || {};
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    if (!/^https?:\/\//i.test(url)) return REAL_FETCH(input, init); // 相对地址（知识库等）直连
    var host;
    try { host = new URL(url).host; } catch (e) { return REAL_FETCH(input, init); }
    if (PROXY_HOSTS.indexOf(host) === -1) return REAL_FETCH(input, init); // 自定义 API 直连
    if (init.method && String(init.method).toUpperCase() !== 'POST') return REAL_FETCH(input, init);

    // 必须是 JSON 且含 messages 才视为聊天请求
    var bodyObj = null;
    try { bodyObj = JSON.parse(init.body); } catch (e) { return REAL_FETCH(input, init); }
    if (!bodyObj || !Array.isArray(bodyObj.messages)) return REAL_FETCH(input, init);

    return probePromise.then(function (base) {
      if (!base) return REAL_FETCH(input, init); // 无可用代理 → 回退直连

      // 复制原始 headers，但剥离 Authorization
      var headers = {};
      if (init.headers) {
        if (typeof init.headers.forEach === 'function') {
          init.headers.forEach(function (v, k) { if (String(k).toLowerCase() !== 'authorization') headers[k] = v; });
        } else {
          Object.keys(init.headers).forEach(function (k) {
            if (String(k).toLowerCase() !== 'authorization') headers[k] = init.headers[k];
          });
        }
      }
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
      headers['x-upstream-host'] = host;

      var newInit = {};
      for (var k in init) if (init.hasOwnProperty(k)) newInit[k] = init[k];
      newInit.headers = headers;
      newInit.body = JSON.stringify(bodyObj);

      // 本机代理走 /chat 端点；远程云函数直接 POST 到其 URL（函数接收任意 POST 代理）
      var target = (base === REMOTE) ? base : base + '/chat';
      return REAL_FETCH(target, newInit);
    });
  };
})();
