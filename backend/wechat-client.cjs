const { randomBytes } = require('node:crypto');
const { networkFetch, withDeadline } = require('./model-client.cjs');

// Wire format follows Tencent/openclaw-weixin 2.4.10 (not an OpenClaw runtime dependency).
const BASE_URL = 'https://ilinkai.weixin.qq.com';
const CHANNEL_VERSION = '2.4.10';
function trustedBase(value = BASE_URL) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !(url.hostname === 'weixin.qq.com' || url.hostname.endsWith('.weixin.qq.com'))) {
    throw Error('微信返回了不受支持的服务地址，请重新扫码');
  }
  return url.origin;
}
function createWechatClient({ fetchImpl = networkFetch } = {}) {
  async function request(endpoint, { baseUrl = BASE_URL, token, body, signal, timeoutMs = 15000 } = {}) {
    const url = new URL(endpoint, trustedBase(baseUrl));
    const headers = { 'iLink-App-Id': 'bot', 'iLink-App-ClientVersion': String((2 << 16) | (4 << 8) | 10) };
    if (body !== undefined) {
      Object.assign(headers, { 'Content-Type': 'application/json', AuthorizationType: 'ilink_bot_token',
        'X-WECHAT-UIN': Buffer.from(String(randomBytes(4).readUInt32BE())).toString('base64') });
      if (token) headers.Authorization = 'Bearer ' + token;
    }
    const input = body === undefined ? undefined : JSON.stringify(token ? {
      ...body, base_info: { channel_version: CHANNEL_VERSION, bot_agent: 'Humancall/' + require('../package.json').version }
    } : body);
    try {
      return await withDeadline(async requestSignal => {
        const response = await fetchImpl(url.href, { method: input === undefined ? 'GET' : 'POST', headers,
          ...(input === undefined ? {} : { body: input }), signal: requestSignal, redirect: 'error' });
        if (!response.ok) throw Object.assign(Error('微信服务请求失败（HTTP ' + response.status + '），请检查网络或重新绑定'), { code: response.status });
        let data;
        try { data = await response.json(); } catch { throw Error('微信服务返回的数据无法读取，请稍后重试'); }
        const code = Number(data.ret || data.errcode || 0);
        if (code) throw Object.assign(Error(code === -14 ? '微信登录已失效，请重新扫码绑定' : '微信服务暂时无法处理请求（' + code + '）'), { code });
        return data;
      }, { signal, timeoutMs });
    } catch (error) {
      if (signal?.aborted || error.code) throw error;
      // Do not surface transport errors, which may contain credentials or QR URLs.
      throw Error('暂时无法连接微信服务，请检查网络后重试');
    }
  }
  return {
    qr: signal => request('/ilink/bot/get_bot_qrcode?bot_type=3', { body: { local_token_list: [] }, signal }),
    qrStatus: (qrcode, baseUrl, verifyCode, signal) => request('/ilink/bot/get_qrcode_status?' +
      new URLSearchParams({ qrcode, ...(verifyCode ? { verify_code: verifyCode } : {}) }), { baseUrl, signal, timeoutMs: 40000 }),
    updates: (account, signal) => request('/ilink/bot/getupdates', { ...account, body: { get_updates_buf: account.cursor || '' }, signal, timeoutMs: 40000 }),
    send: (account, message, signal) => request('/ilink/bot/sendmessage', { ...account, body: { msg: message }, signal }),
    notify: (account, started, signal) => request('/ilink/bot/msg/notify' + (started ? 'start' : 'stop'), { ...account, body: {}, signal, timeoutMs: 10000 })
  };
}
module.exports = { createWechatClient, trustedBase, BASE_URL };
