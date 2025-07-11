// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  Gaxios,
  GaxiosError,
  GaxiosInterceptor,
  GaxiosOptions,
  GaxiosOptionsPrepared,
  GaxiosResponse,
} from 'gaxios';
import {AuthClient, GoogleAuth, GoogleAuthOptions} from 'google-auth-library';
import {
  getModuleFormat,
  getRuntimeTrackingString,
  getUserAgentString,
} from './util';
import {randomUUID} from 'crypto';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import {GCCL_GCS_CMD_KEY} from './nodejs-common/util';
import {RetryOptions} from './storage';

export interface StandardStorageQueryParams {
  alt?: 'json' | 'media';
  callback?: string;
  fields?: string;
  key?: string;
  prettyPrint?: boolean;
  quotaUser?: string;
  userProject?: string;
}

export interface StorageQueryParameters extends StandardStorageQueryParams {
  [key: string]: string | number | boolean | undefined;
}

export interface StorageRequestOptions extends GaxiosOptions {
  [GCCL_GCS_CMD_KEY]?: string;
  interceptors?: GaxiosInterceptor<GaxiosOptionsPrepared>[];
  autoPaginate?: boolean;
  autoPaginateVal?: boolean;
  maxRetries?: number;
  objectMode?: boolean;
  projectId?: string;
  queryParameters?: StorageQueryParameters;
  shouldReturnStream?: boolean;
}

interface TransportParameters extends Omit<GoogleAuthOptions, 'authClient'> {
  apiEndpoint: string;
  authClient?: GoogleAuth | AuthClient;
  baseUrl: string;
  customEndpoint?: boolean;
  email?: string;
  retryOptions: RetryOptions;
  scopes: string | string[];
  timeout?: number;
  token?: string;
  useAuthWithCustomEndpoint?: boolean;
  userAgent?: string;
  gaxiosInstance?: Gaxios;
}

export interface StorageTransportCallback<T> {
  (
    err: GaxiosError | null,
    data?: T | null,
    fullResponse?: GaxiosResponse,
  ): void;
}
let projectId: string;

export class StorageTransport {
  authClient: GoogleAuth<AuthClient>;
  private providedUserAgent?: string;
  private retryOptions: RetryOptions;
  private baseUrl: string;
  private timeout?: number;
  private projectId?: string;
  private useAuthWithCustomEndpoint?: boolean;
  private gaxiosInstance: Gaxios;

  constructor(options: TransportParameters) {
    this.gaxiosInstance = options.gaxiosInstance || new Gaxios();
    if (options.authClient instanceof GoogleAuth) {
      this.authClient = options.authClient;
    } else {
      this.authClient = new GoogleAuth({
        ...options,
        authClient: options.authClient,
        clientOptions: options.clientOptions,
      });
    }
    this.providedUserAgent = options.userAgent;
    this.retryOptions = options.retryOptions;
    this.baseUrl = options.baseUrl;
    this.timeout = options.timeout;
    this.projectId = options.projectId;
    this.useAuthWithCustomEndpoint = options.useAuthWithCustomEndpoint;
  }

  async makeRequest<T>(
    reqOpts: StorageRequestOptions,
    callback?: StorageTransportCallback<T>,
  ): Promise<void | T> {
    const headers = this.#buildRequestHeaders(reqOpts.headers);
    if (reqOpts[GCCL_GCS_CMD_KEY]) {
      headers.set(
        'x-goog-api-client',
        `${headers.get('x-goog-api-client')} gccl-gcs-cmd/${
          reqOpts[GCCL_GCS_CMD_KEY]
        }`,
      );
    }
    if (reqOpts.interceptors) {
      this.gaxiosInstance.interceptors.request.clear();
      for (const inter of reqOpts.interceptors) {
        this.gaxiosInstance.interceptors.request.add(inter);
      }
    }

    try {
      const getProjectId = async () => {
        if (reqOpts.projectId) return reqOpts.projectId;
        projectId = await this.authClient.getProjectId();
        return projectId;
      };
      const _projectId = await getProjectId();
      if (_projectId) {
        projectId = _projectId;
        this.projectId = projectId;
      }

      const requestPromise = this.authClient.request<T>({
        retryConfig: {
          retry: this.retryOptions.maxRetries,
          noResponseRetries: this.retryOptions.maxRetries,
          maxRetryDelay: this.retryOptions.maxRetryDelay,
          retryDelayMultiplier: this.retryOptions.retryDelayMultiplier,
          shouldRetry: this.retryOptions.retryableErrorFn,
          totalTimeout: this.retryOptions.totalTimeout,
        },
        ...reqOpts,
        headers,
        url: this.#buildUrl(reqOpts.url?.toString(), reqOpts.queryParameters),
        timeout: this.timeout,
      });

      return callback
        ? requestPromise
            .then(resp => callback(null, resp.data, resp))
            .catch(err => callback(err, null, err.response))
        : (requestPromise.then(resp => resp.data) as Promise<T>);
    } catch (e) {
      if (callback) return callback(e as GaxiosError);
      throw e;
    }
  }

  #buildUrl(pathUri = '', queryParameters: StorageQueryParameters = {}): URL {
    if (
      'project' in queryParameters &&
      (queryParameters.project !== this.projectId ||
        queryParameters.project !== projectId)
    ) {
      queryParameters.project = this.projectId;
    }
    const qp = this.#buildRequestQueryParams(queryParameters);
    let url: URL;
    if (this.#isValidUrl(pathUri)) {
      url = new URL(pathUri);
    } else {
      url = new URL(`${this.baseUrl}${pathUri}`);
    }
    url.search = qp;

    return url;
  }

  #isValidUrl(url: string): boolean {
    try {
      return Boolean(new URL(url));
    } catch {
      return false;
    }
  }

  #buildRequestHeaders(requestHeaders = {}) {
    const headers = new Headers(requestHeaders);

    headers.set('User-Agent', this.#getUserAgentString());
    headers.set(
      'x-goog-api-client',
      `${getRuntimeTrackingString()} gccl/7.16.0-${getModuleFormat()} gccl-invocation-id/${randomUUID()}`,
    );

    return headers;
  }

  #buildRequestQueryParams(queryParameters: StorageQueryParameters): string {
    const qp = new URLSearchParams(
      queryParameters as unknown as Record<string, string>,
    );

    return qp.toString();
  }

  #getUserAgentString(): string {
    let userAgent = getUserAgentString();
    if (this.providedUserAgent) {
      userAgent = `${this.providedUserAgent} ${userAgent}`;
    }

    return userAgent;
  }
}
