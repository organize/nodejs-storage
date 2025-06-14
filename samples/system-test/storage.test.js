// Copyright 2022 Google LLC
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

'use strict';

const {assert} = require('chai');
const {it} = require('mocha');
const cp = require('child_process');

const execSync = cmd => cp.execSync(cmd, {encoding: 'utf-8'});

it('should intialize storage with a custom api endpoint', async () => {
  const apiEndpoint = 'https://storage.googleapis.com';
  const output = execSync(`node setClientEndpoint.js ${apiEndpoint}`);
  assert.match(
    output,
    new RegExp(`Client initiated with endpoint: ${apiEndpoint}.`),
  );
});
