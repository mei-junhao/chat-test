/*
 * proxy.js — 本地代理「透明拦截」前端侧
 * ------------------------------------------------------------
 * 作用：当本机运行 local-server.js（开发服务器 + 代理）时，把对
 *       api.deepseek.com / api.kkdmx.com / apihub.agnes-ai.com
 *       的聊天请求重路由到本地 /chat，并剥离 Authorization（key）。
 *       这样浏览器永远不直接持有 key，key 只留在你本机服务端。
 *
 * 安全前提：本文件只做「请求重路由」，不藏任何 key。
 * 兼容前提：若本机没有运行代理（例如直接打开已部署的 GitHub Pages），
 *       探测失败，自动回退为原始直连逻辑（与现在行为一致）。
 *
 * 自定义 API（用户输入的其它地址，如 OpenAI / 硅基流动）不在此拦截范围内，
 * 仍按原样直连，key 由用户自己负责。
 */
(function () {
  'use strict';
  var REAL_FETCH = window.fetch ? window.fetch.bind(window) : null;
  if (!REAL_FETCH) return; // 极老环境不支持 fetch，直接跳过

  // 仅这几个「已知上游」会被拦截并重路由；其它地址（含自定义 API）保持直连
  var PROXY_HOSTS = ['api.deepseek.com', 'api.kkdmx.com', 'apihub.agnes-ai.com'];

  // 探测候选：优先同源 dev server（推荐做法），其次独立代理 3000 端口
  var CANDIDATES = [];
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    CANDIDATES.push(location.origin);
  }
  CANDIDATES.push('http://localhost:3000');

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
      if (!base) return REAL_FETCH(input, init); // 本机无代理 → 回退直连

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

      return REAL_FETCH(base + '/chat', newInit);
    });
  };
})();
