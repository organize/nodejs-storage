// Copyright 2019 Google LLC
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

// sample-metadata:
//   title: Deactivate HMAC SA Key.
//   description: Deactivate HMAC SA Key.
//   usage: node hmacKeyDeactivate.js <hmacKeyAccessId> [projectId]

function main(
  hmacKeyAccessId = 'GOOG0234230X00',
  projectId = 'serviceAccountProjectId',
) {
  // [START storage_deactivate_hmac_key]
  /**
   * TODO(developer): Uncomment the following lines before running the sample.
   */
  // The access ID of the HMAC key
  // const hmacKeyAccessId = 'GOOG0234230X00';

  // The ID of the project to which the service account belongs
  // const projectId = 'project-id';

  // Imports the Google Cloud client library
  const {Storage} = require('@google-cloud/storage');

  // Creates a client
  const storage = new Storage();

  // Deactivate HMAC SA Key
  async function deactivateHmacKey() {
    const hmacKey = storage.hmacKey(hmacKeyAccessId, {projectId});
    const [hmacKeyMetadata] = await hmacKey.setMetadata({state: 'INACTIVE'});

    console.log('The HMAC key is now inactive.');
    console.log('The HMAC key metadata is:');
    for (const [key, value] of Object.entries(hmacKeyMetadata)) {
      console.log(`${key}: ${value}`);
    }
  }
  // [END storage_deactivate_hmac_key]
  deactivateHmacKey().catch(console.error);
}

main(...process.argv.slice(2));
