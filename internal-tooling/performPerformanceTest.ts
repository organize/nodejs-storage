/*!
 * Copyright 2022 Google LLC. All Rights Reserved.
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

import yargs from 'yargs';
import {performance} from 'perf_hooks';
import {parentPort} from 'worker_threads';
import * as path from 'path';
import {
  cleanupFile,
  generateRandomFile,
  generateRandomFileName,
  getLowHighFileSize,
  getValidationType,
  NODE_DEFAULT_HIGHWATER_MARK_BYTES,
  performanceTestCommand,
  performanceTestSetup,
  PERFORMANCE_TEST_TYPES,
  TestResult,
} from './performanceUtils.js';
import {Bucket} from '../src/index.js';
import {getDirName} from '../src/util.js';

const TEST_NAME_STRING = 'nodejs-perf-metrics';
const DEFAULT_NUMBER_OF_WRITES = 1;
const DEFAULT_NUMBER_OF_READS = 3;
const DEFAULT_RANGE_READS = 3;

let bucket: Bucket;
const checkType = getValidationType();

const argv = yargs(process.argv.slice(2))
  .command(performanceTestCommand)
  .parseSync();

/**
 * Main entry point. This function performs a test iteration and posts the message back
 * to the parent thread.
 */
async function main() {
  let results: TestResult[] = [];

  ({bucket} = await performanceTestSetup(
    argv.project! as string,
    argv.bucket! as string,
  ));

  switch (argv.test_type) {
    case PERFORMANCE_TEST_TYPES.WRITE_ONE_READ_THREE:
      results = await performWriteReadTest();
      break;
    case PERFORMANCE_TEST_TYPES.RANGE_READ:
      results = await performRangedReadTest();
      break;
    default:
      break;
  }

  parentPort?.postMessage(results);
}

/**
 * Performs an iteration of a ranged read test. Only the last result will be reported.
 *
 * @returns {Promise<TestResult[]>} Promise that resolves to an array of test results for the iteration.
 */
async function performRangedReadTest(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const fileSizeRange = getLowHighFileSize(argv.object_size as string);
  const fileName = generateRandomFileName(TEST_NAME_STRING);
  generateRandomFile(
    fileName,
    fileSizeRange.low,
    fileSizeRange.high,
    getDirName(),
  );
  const file = bucket.file(`${fileName}`);
  const destinationFileName = generateRandomFileName(TEST_NAME_STRING);
  const destination = path.join(getDirName(), destinationFileName);

  const iterationResult: TestResult = {
    op: 'READ[0]',
    objectSize: argv.range_read_size as number,
    appBufferSize: NODE_DEFAULT_HIGHWATER_MARK_BYTES,
    crc32cEnabled: false,
    md5Enabled: false,
    api: 'JSON',
    elapsedTimeUs: 0,
    cpuTimeUs: -1,
    status: 'OK',
    chunkSize: argv.range_read_size as number,
    workers: argv.workers as number,
    library: 'nodejs',
    transferSize: argv.range_read_size as number,
    transferOffset: 0,
    bucketName: bucket.name,
  };

  await bucket.upload(`${getDirName()}/${fileName}`);
  cleanupFile(fileName);

  for (let i = 0; i < DEFAULT_RANGE_READS; i++) {
    const start = performance.now();
    await file.download({
      start: 0,
      end: argv.range_read_size as number,
      destination,
    });
    const end = performance.now();
    cleanupFile(destinationFileName);
    iterationResult.elapsedTimeUs = Math.round((end - start) * 1000);
  }

  await file.delete({ignoreNotFound: true});
  results.push(iterationResult);
  return results;
}

/**
 * Performs an iteration of the Write 1 / Read 3 performance measuring test.
 *
 * @returns {Promise<TestResult[]>} Promise that resolves to an array of test results for the iteration.
 */
async function performWriteReadTest(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const fileSizeRange = getLowHighFileSize(argv.object_size as string);
  const fileName = generateRandomFileName(TEST_NAME_STRING);
  const file = bucket.file(`${fileName}`);
  const sizeInBytes = generateRandomFile(
    fileName,
    fileSizeRange.low,
    fileSizeRange.high,
    getDirName(),
  );

  for (let j = 0; j < DEFAULT_NUMBER_OF_WRITES; j++) {
    let start = 0;
    let end = 0;

    const iterationResult: TestResult = {
      op: 'WRITE',
      objectSize: sizeInBytes,
      appBufferSize: NODE_DEFAULT_HIGHWATER_MARK_BYTES,
      crc32cEnabled: checkType === 'crc32c',
      md5Enabled: checkType === 'md5',
      api: 'JSON',
      elapsedTimeUs: 0,
      cpuTimeUs: -1,
      status: 'OK',
      chunkSize: sizeInBytes,
      workers: argv.workers as number,
      library: 'nodejs',
      transferSize: sizeInBytes,
      transferOffset: 0,
      bucketName: bucket.name,
    };

    start = performance.now();
    await bucket.upload(`${getDirName()}/${fileName}`, {validation: checkType});
    end = performance.now();

    iterationResult.elapsedTimeUs = Math.round((end - start) * 1000);
    results.push(iterationResult);
    cleanupFile(fileName);
  }

  const iterationResult: TestResult = {
    op: 'READ[0]',
    objectSize: sizeInBytes,
    appBufferSize: NODE_DEFAULT_HIGHWATER_MARK_BYTES,
    crc32cEnabled: checkType === 'crc32c',
    md5Enabled: checkType === 'md5',
    api: 'JSON',
    elapsedTimeUs: 0,
    cpuTimeUs: -1,
    status: 'OK',
    chunkSize: sizeInBytes,
    workers: argv.workers as number,
    library: 'nodejs',
    transferSize: sizeInBytes,
    transferOffset: 0,
    bucketName: bucket.name,
  };

  for (let j = 0; j < DEFAULT_NUMBER_OF_READS; j++) {
    let start = 0;
    let end = 0;

    const destinationFileName = generateRandomFileName(TEST_NAME_STRING);
    const destination = path.join(getDirName(), destinationFileName);

    start = performance.now();
    await file.download({validation: checkType, destination});
    end = performance.now();

    cleanupFile(destinationFileName);
    iterationResult.elapsedTimeUs = Math.round((end - start) * 1000);
  }

  await file.delete({ignoreNotFound: true});
  results.push(iterationResult);
  return results;
}

void main();
