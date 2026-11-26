import { RPC_PATH } from '../shared/constants.js';
import { resolveScopeForSession, resolveSessionCwd } from './scope-resolver.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function okResult(value) {
  return jsonResponse({ ok: true, value }, 200);
}

function errorResult(code, message, details = {}, status = 200) {
  return jsonResponse({ ok: false, error: { code, message, details } }, status);
}

export function registerRpcRoutes(ctx, bridgeService) {
  const dispose = ctx.connection.fetch.register({
    path: RPC_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      let body;
      try {
        body = await request.json();
      } catch {
        return errorResult('canvas-bridge/bad-request', 'Request body must be valid JSON.', {}, 400);
      }

      const action = typeof body?.action === 'string' ? body.action : '';
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';

      if (!sessionId && action !== 'updateSettings') {
        return errorResult('canvas-bridge/bad-request', 'Missing sessionId parameter.');
      }

      try {
        if (action === 'updateSettings') {
          const nextConfig = await bridgeService.updateUserConfig(payload.settings || {});
          return okResult({ config: nextConfig });
        }

        const scope = await resolveScopeForSession(ctx, sessionId);

        switch (action) {
          case 'getStatus': {
            const status = await bridgeService.getStatus(scope, sessionId, {
              autoStart: payload.autoStart === true,
            });
            return okResult(status);
          }

          case 'initProject': {
            const cwd = await resolveSessionCwd(ctx, sessionId);
            if (!cwd) {
              return errorResult('canvas-bridge/no-cwd', 'Current session does not have a working directory.');
            }
            const res = await bridgeService.initProject(cwd, {
              title: payload.title,
              dataDir: payload.dataDir,
            });
            const status = await bridgeService.getStatus(res.scope, sessionId, {
              autoStart: payload.autoStart !== false,
            });
            return okResult({ created: res.created, status });
          }

          case 'ensureStarted': {
            if (!scope.active) {
              return errorResult('canvas-bridge/inactive', 'Current workspace is not an Infinite Canvas project.');
            }
            await bridgeService.ensureStarted(scope);
            const status = await bridgeService.getStatus(scope, sessionId, { autoStart: false });
            return okResult(status);
          }

          case 'restartInstance': {
            if (!scope.active) {
              return errorResult('canvas-bridge/inactive', 'Current workspace is not an Infinite Canvas project.');
            }
            await bridgeService.restartInstance(scope);
            const status = await bridgeService.getStatus(scope, sessionId, { autoStart: false });
            return okResult(status);
          }

          case 'stopInstance': {
            if (!scope.active) {
              return errorResult('canvas-bridge/inactive', 'Current workspace is not an Infinite Canvas project.');
            }
            await bridgeService.stopInstance(scope);
            const status = await bridgeService.getStatus(scope, sessionId, { autoStart: false });
            return okResult(status);
          }

          case 'setActiveProject': {
            const binding = bridgeService.setSessionProjectId(sessionId, payload.projectId, scope);
            return okResult({ binding });
          }

          case 'ackUiAction': {
            return okResult(bridgeService.ackUiAction(sessionId, payload.seq));
          }

          default:
            return errorResult('canvas-bridge/unknown-action', `Unsupported action: ${action}`);
        }
      } catch (error) {
        return errorResult(
          'canvas-bridge/error',
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });

  return () => {
    if (typeof dispose === 'function') dispose();
  };
}
