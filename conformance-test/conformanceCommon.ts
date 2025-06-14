/*!
 * Copyright 2021 Google LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as jsonToNodeApiMapping from './test-data/retryInvocationMap.json';
import * as libraryMethods from './libraryMethods';
import {
  Bucket,
  File,
  GaxiosOptions,
  GaxiosOptionsPrepared,
  HmacKey,
  Notification,
  Storage,
} from '../src';
import * as uuid from 'uuid';
import * as assert from 'assert';
import {
  StorageRequestOptions,
  StorageTransport,
} from '../src/storage-transport';
interface RetryCase {
  instructions: String[];
}

interface Method {
  name: String;
  resources: String[];
  group?: String;
}

export interface RetryTestCase {
  id: number;
  description: String;
  cases: RetryCase[];
  methods: Method[];
  preconditionProvided: boolean;
  expectSuccess: boolean;
}

interface ConformanceTestCreationResult {
  id: string;
}

interface ConformanceTestResult {
  completed: boolean;
}

type LibraryMethodsModuleType = typeof import('./libraryMethods');
const methodMap: Map<String, String[]> = new Map(
  Object.entries({}), // TODO: replace with Object.entries(jsonToNodeApiMapping)
);

const DURATION_SECONDS = 600; // 10 mins.
const TESTS_PREFIX = `storage.retry.tests.${shortUUID()}.`;
const TESTBENCH_HOST =
  process.env.STORAGE_EMULATOR_HOST || 'http://localhost:9000/';
const CONF_TEST_PROJECT_ID = 'my-project-id';
const TIMEOUT_FOR_INDIVIDUAL_TEST = 20000;
const RETRY_MULTIPLIER_FOR_CONFORMANCE_TESTS = 0.01;

export function executeScenario(testCase: RetryTestCase) {
  for (
    let instructionNumber = 0;
    instructionNumber < testCase.cases.length;
    instructionNumber++
  ) {
    const instructionSet: RetryCase = testCase.cases[instructionNumber];
    testCase.methods.forEach(async jsonMethod => {
      const functionList =
        jsonMethod?.group !== undefined
          ? methodMap.get(jsonMethod?.group)
          : methodMap.get(jsonMethod?.name);
      functionList?.forEach(storageMethodString => {
        const storageMethodObject =
          libraryMethods[storageMethodString as keyof LibraryMethodsModuleType];
        let bucket: Bucket;
        let file: File;
        let notification: Notification;
        let creationResult: {id: string};
        let storage: Storage;
        let hmacKey: HmacKey;
        let storageTransport: StorageTransport;

        describe(`${storageMethodString}`, async () => {
          beforeEach(async () => {
            storageTransport = new StorageTransport({
              apiEndpoint: TESTBENCH_HOST,
              authClient: undefined,
              baseUrl: TESTBENCH_HOST,
              retryOptions: {
                retryDelayMultiplier: RETRY_MULTIPLIER_FOR_CONFORMANCE_TESTS,
                maxRetries: 3,
                maxRetryDelay: 32,
                totalTimeout: TIMEOUT_FOR_INDIVIDUAL_TEST,
              },
              scopes: [
                'http://www.googleapis.com/auth/devstorage.full_control',
              ],
              projectId: CONF_TEST_PROJECT_ID,
              userAgent: 'retry-test',
              useAuthWithCustomEndpoint: true,
              customEndpoint: true,
              timeout: DURATION_SECONDS,
            });

            storage = new Storage({
              apiEndpoint: TESTBENCH_HOST,
              projectId: CONF_TEST_PROJECT_ID,
              retryOptions: {
                retryDelayMultiplier: RETRY_MULTIPLIER_FOR_CONFORMANCE_TESTS,
              },
            });

            creationResult = await createTestBenchRetryTest(
              instructionSet.instructions,
              jsonMethod?.name.toString(),
              storageTransport,
            );
            if (storageMethodString.includes('InstancePrecondition')) {
              bucket = await createBucketForTest(
                storage,
                testCase.preconditionProvided,
                storageMethodString,
              );
              file = await createFileForTest(
                testCase.preconditionProvided,
                storageMethodString,
                bucket,
              );
            } else {
              bucket = await createBucketForTest(
                storage,
                false,
                storageMethodString,
              );
              file = await createFileForTest(
                false,
                storageMethodString,
                bucket,
              );
            }
            notification = bucket.notification(TESTS_PREFIX);
            await notification.create();

            [hmacKey] = await storage.createHmacKey(
              `${TESTS_PREFIX}@email.com`,
            );

            storage.interceptors.push({
              resolved: (
                requestConfig: GaxiosOptionsPrepared,
              ): Promise<GaxiosOptionsPrepared> => {
                const config = requestConfig as GaxiosOptions;
                config.headers = config.headers || {};
                Object.assign(config.headers, {
                  'x-retry-test-id': creationResult.id,
                });
                return Promise.resolve(config as GaxiosOptionsPrepared);
              },
              rejected: error => {
                return Promise.reject(error);
              },
            });
          });

          it(`${instructionNumber}`, async () => {
            const methodParameters: libraryMethods.ConformanceTestOptions = {
              storage: storage,
              bucket: bucket,
              file: file,
              storageTransport: storageTransport,
              notification: notification,
              hmacKey: hmacKey,
            };
            if (testCase.preconditionProvided) {
              methodParameters.preconditionRequired = true;
            }

            if (testCase.expectSuccess) {
              assert.ifError(await storageMethodObject(methodParameters));
            } else {
              await assert.rejects(async () => {
                await storageMethodObject(methodParameters);
              }, undefined);
            }

            const testBenchResult = await getTestBenchRetryTest(
              creationResult.id,
              storageTransport,
            );
            assert.strictEqual(testBenchResult.completed, true);
          }).timeout(TIMEOUT_FOR_INDIVIDUAL_TEST);
        });
      });
    });
  }
}

async function createBucketForTest(
  storage: Storage,
  preconditionShouldBeOnInstance: boolean,
  storageMethodString: String,
) {
  const name = generateName(storageMethodString, 'bucket');
  const bucket = storage.bucket(name);
  await bucket.create();
  await bucket.setRetentionPeriod(DURATION_SECONDS);

  if (preconditionShouldBeOnInstance) {
    return new Bucket(storage, bucket.name, {
      preconditionOpts: {
        ifMetagenerationMatch: 2,
      },
    });
  }
  return bucket;
}

async function createFileForTest(
  preconditionShouldBeOnInstance: boolean,
  storageMethodString: String,
  bucket: Bucket,
) {
  const name = generateName(storageMethodString, 'file');
  const file = bucket.file(name);
  await file.save(name);
  if (preconditionShouldBeOnInstance) {
    return new File(bucket, file.name, {
      preconditionOpts: {
        ifMetagenerationMatch: file.metadata.metageneration,
        ifGenerationMatch: file.metadata.generation,
      },
    });
  }
  return file;
}

function generateName(storageMethodString: String, bucketOrFile: string) {
  return `${TESTS_PREFIX}${storageMethodString.toLowerCase()}${bucketOrFile}.${shortUUID()}`;
}

async function createTestBenchRetryTest(
  instructions: String[],
  methodName: string,
  storageTransport: StorageTransport,
): Promise<ConformanceTestCreationResult> {
  const requestBody = {instructions: {[methodName]: instructions}};

  const requestOptions: StorageRequestOptions = {
    method: 'POST',
    url: 'retry_test',
    body: JSON.stringify(requestBody),
    headers: {'Content-Type': 'application/json'},
  };

  const response = await storageTransport.makeRequest(requestOptions);
  return response as unknown as ConformanceTestCreationResult;
}

async function getTestBenchRetryTest(
  testId: string,
  storageTransport: StorageTransport,
): Promise<ConformanceTestResult> {
  const response = await storageTransport.makeRequest({
    url: `retry_test/${testId}`,
    method: 'GET',
    retry: true,
    headers: {
      'x-retry-test-id': testId,
    },
  });
  return response as unknown as ConformanceTestResult;
}

function shortUUID() {
  return uuid.v1().split('-').shift();
}
