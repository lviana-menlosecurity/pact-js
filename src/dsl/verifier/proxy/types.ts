import express from 'express';
import { LogLevel } from '../../options';
import { JsonMap } from '../../../common/jsonTypes';

export type Hook = () => Promise<unknown>;

export interface StateHandlers {
  [name: string]: StateHandlerV3;
}
export interface ProviderState {
  states?: [string];
}
export interface ProviderStateV3 {
  action: StateAction;
  params: JsonMap;
  state: string;
}

/**
 * Specifies whether the state handler being setup or shutdown
 */
export type StateAction = 'setup' | 'teardown';

/**
 * Define needed state for given pacts
 */
export type StateHandlerV3 = (
  setup?: boolean,
  parameters?: Record<string, unknown>
) => Promise<JsonMap | void>;

export interface ProxyOptions {
  logLevel?: LogLevel;
  requestFilter?: express.RequestHandler;
  stateHandlers?: StateHandlers;
  beforeEach?: Hook;
  afterEach?: Hook;
  validateSSL?: boolean;
  changeOrigin?: boolean;
  providerBaseUrl: string;
}
