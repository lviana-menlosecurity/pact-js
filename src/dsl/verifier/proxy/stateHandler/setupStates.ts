import logger from '../../../../common/logger';
import { ProxyOptions, ProviderState, ProviderStateV3 } from '../types';

const isProviderStateV3 = (
  descriptor: ProviderStateV3 | ProviderState
): descriptor is ProviderStateV3 =>
  (descriptor as ProviderStateV3).action !== undefined;

// Lookup the handler based on the description, or get the default handler
export const setupStates = (
  descriptor: ProviderState | ProviderStateV3,
  config: ProxyOptions
): Promise<unknown> => {
  const promises: Array<Promise<unknown>> = [];

  if (isProviderStateV3(descriptor)) {
    const handler = config.stateHandlers
      ? config.stateHandlers[descriptor.state]
      : null;

    if (handler) {
      promises.push(handler(descriptor.action === 'setup', descriptor.params));
    } else {
      logger.warn(`No state handler found for "${descriptor.state}", ignoring`);
    }
  } else if (descriptor && descriptor?.states) {
    descriptor.states.forEach((state) => {
      const handler = config.stateHandlers ? config.stateHandlers[state] : null;

      if (handler) {
        promises.push(handler());
      } else {
        logger.warn(`No state handler found for "${state}", ignoring`);
      }
    });
  }

  return Promise.all(promises);
};
