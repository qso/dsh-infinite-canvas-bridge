import { registerAgentIntegration } from './agent-integration.js';
import { InfiniteCanvasBridgeService } from './bridge-service.js';
import { registerRpcRoutes } from './rpc-routes.js';

export const inject = ['sessions', 'connection'];

export function apply(ctx, config = {}) {
  const bridgeService = new InfiniteCanvasBridgeService(config);

  const disposeRoutes = registerRpcRoutes(ctx, bridgeService);
  ctx.effect(() => disposeRoutes, 'dsh-infinite-canvas-bridge: RPC routes');
  ctx.effect(() => () => {
    void bridgeService.dispose();
  }, 'dsh-infinite-canvas-bridge: process cleanup');

  registerAgentIntegration(ctx, bridgeService);
}
