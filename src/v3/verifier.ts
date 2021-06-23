import { isEmpty } from 'ramda';
import { ProxyOptions, StateHandlers } from 'dsl/verifier/proxy/types';
import { omit } from 'lodash';

import * as express from 'express';
import * as http from 'http';
import * as url from 'url';
import { localAddresses } from '../common/net';
import { createProxy, waitForServerReady } from '../dsl/verifier/proxy';

import ConfigurationError from '../errors/configurationError';
import logger, { setLogLevel } from '../common/logger';

import * as PactNative from '../../native/index.node';

// Commented out fields highlight areas we need to look at for compatibility
// with existing API, as a sort of "TODO" list.
export interface VerifierV3Options {
  provider: string;
  logLevel: string;
  providerBaseUrl: string;
  pactUrls?: string[];
  pactBrokerUrl?: string;
  providerStatesSetupUrl?: string;
  pactBrokerUsername?: string;
  pactBrokerPassword?: string;
  pactBrokerToken?: string;

  /**
   * The timeout in milliseconds for request filters and provider state handlers
   * to execute within
   */
  callbackTimeout?: number;
  // customProviderHeaders?: string[]
  publishVerificationResult?: boolean;
  providerVersion?: string;
  requestFilter?: express.RequestHandler;
  stateHandlers?: StateHandlers;

  consumerVersionTags?: string | string[];
  providerVersionTags?: string | string[];
  consumerVersionSelectors?: ConsumerVersionSelector[];
  enablePending?: boolean;
  // timeout?: number;
  // verbose?: boolean;
  includeWipPactsSince?: string;
  // out?: string;
  // logDir?: string;
  disableSSLVerification?: boolean;
}

export interface ConsumerVersionSelector {
  pacticipant?: string;
  tag?: string;
  version?: string;
  latest?: boolean;
  all?: boolean;
}

interface InternalVerifierOptions {
  consumerVersionSelectorsString?: string[];
}

export type VerifierOptions = VerifierV3Options & ProxyOptions;
export class VerifierV3 {
  private config: VerifierOptions;

  private address = 'http://localhost';

  private stateSetupPath = '/_pactSetup';

  constructor(config: VerifierOptions) {
    this.config = config;

    if (this.config.logLevel && !isEmpty(this.config.logLevel)) {
      setLogLevel(this.config.logLevel);
    }

    if (this.config.validateSSL === undefined) {
      this.config.validateSSL = true;
    }

    if (this.config.changeOrigin === undefined) {
      this.config.changeOrigin = false;

      if (!this.isLocalVerification()) {
        this.config.changeOrigin = true;
        logger.debug(
          `non-local provider address ${this.config.providerBaseUrl} detected, setting 'changeOrigin' to 'true'. This property can be overridden.`
        );
      }
    }
  }

  /**
   * Verify a HTTP Provider
   */
  public verifyProvider(): Promise<unknown> {
    const config: VerifierV3Options & InternalVerifierOptions = {
      ...this.config,
    };

    if (isEmpty(this.config)) {
      throw new ConfigurationError('No configuration provided to verifier');
    }

    // This is just too messy to do on the rust side. neon-serde would have helped, but appears unmaintained
    // and is currently incompatible
    if (this.config.consumerVersionSelectors) {
      config.consumerVersionSelectorsString = this.config.consumerVersionSelectors.map(
        (s) => JSON.stringify(s)
      );
    }

    if (!this.config.provider) {
      throw new ConfigurationError('Provider name is required');
    }

    if (
      (isEmpty(this.config.pactUrls) || !this.config.pactUrls) &&
      !this.config.pactBrokerUrl
    ) {
      throw new ConfigurationError(
        'Either a list of pactUrls or a pactBrokerUrl must be provided'
      );
    }

    // Start the verification CLI proxy server
    const server = createProxy(this.config, this.stateSetupPath);

    // Run the verification once the proxy server is available
    return waitForServerReady(server)
      .then(this.runProviderVerification())
      .then((result: unknown) => {
        server.close();
        return result;
      })
      .catch((e: Error) => {
        server.close();
        throw e;
      });
  }

  // Run the Verification CLI process
  private runProviderVerification() {
    return (server: http.Server) =>
      new Promise((resolve, reject) => {
        const opts = {
          providerStatesSetupUrl: `${this.address}:${server.address().port}${
            this.stateSetupPath
          }`,
          ...omit(this.config, 'handlers'),
          providerBaseUrl: `${this.address}:${server.address().port}`,
        };

        try {
          PactNative.verify_provider(opts, (err, val) => {
            if (err || !val) {
              logger.debug(
                'In verify_provider callback: FAILED with',
                err,
                val
              );
              reject(err);
            } else {
              logger.debug('In verify_provider callback: SUCCEEDED with', val);
              resolve(val);
            }
          });
          logger.debug('Submitted test to verify_provider');
        } catch (e) {
          reject(e);
        }
      });
  }

  private isLocalVerification() {
    const u = new url.URL(this.config.providerBaseUrl);
    return (
      localAddresses.includes(u.host) || localAddresses.includes(u.hostname)
    );
  }
}
