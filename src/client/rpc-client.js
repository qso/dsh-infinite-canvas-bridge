import { RPC_PATH } from '../shared/constants.js';

export function createBridgeRpcClient() {
  async function call(action, payload = {}) {
    const res = await fetch(RPC_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action, payload }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const msg = data?.error?.message || `RPC ${action} failed (HTTP ${res.status})`;
      const err = new Error(msg);
      err.code = data?.error?.code || 'RPC_ERROR';
      throw err;
    }
    return data.value;
  }

  return {
    getStatus: (sessionId, autoStart = false) => call('getStatus', { sessionId, autoStart }),
    initProject: (sessionId, options = {}) => call('initProject', { sessionId, ...options }),
    ensureStarted: (sessionId) => call('ensureStarted', { sessionId }),
    restartInstance: (sessionId) => call('restartInstance', { sessionId }),
    stopInstance: (sessionId) => call('stopInstance', { sessionId }),
    updateSettings: (settings) => call('updateSettings', { settings }),
    setActiveProject: (sessionId, projectId) => call('setActiveProject', { sessionId, projectId }),
    ackUiAction: (sessionId, seq) => call('ackUiAction', { sessionId, seq }),
  };
}
