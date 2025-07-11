// Copyright 2020 Google LLC
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
const path = require('path');

function main(
  bucketName = 'my-bucket',
  filePath = path.join(__dirname, '../resources', 'test.txt'),
  destFileName = 'test.txt',
  key = process.env.GOOGLE_CLOUD_KMS_KEY_US,
  generationMatchPrecondition = 0,
) {
  // [START storage_upload_encrypted_file]
  /**
   * TODO(developer): Uncomment the following lines before running the sample.
   */
  // The ID of your GCS bucket
  // const bucketName = 'your-unique-bucket-name';

  // The path to your file to upload
  // const filePath = 'path/to/your/file';

  // The new ID for your GCS file
  // const destFileName = 'your-new-file-name';

  // The key to encrypt the object with
  // const key = 'TIbv/fjexq+VmtXzAlc63J4z5kFmWJ6NdAPQulQBT7g=';

  // Imports the Google Cloud client library
  const {Storage} = require('@google-cloud/storage');

  // Creates a client
  const storage = new Storage();

  async function uploadEncryptedFile() {
    const options = {
      destination: destFileName,
      encryptionKey: Buffer.from(key, 'base64'),

      // Optional:
      // Set a generation-match precondition to avoid potential race conditions
      // and data corruptions. The request to upload is aborted if the object's
      // generation number does not match your precondition. For a destination
      // object that does not yet exist, set the ifGenerationMatch precondition to 0
      // If the destination object already exists in your bucket, set instead a
      // generation-match precondition using its generation number.
      preconditionOpts: {ifGenerationMatch: generationMatchPrecondition},
    };

    await storage.bucket(bucketName).upload(filePath, options);

    console.log(
      `File ${filePath} uploaded to gs://${bucketName}/${destFileName}`,
    );
  }

  uploadEncryptedFile().catch(console.error);
  // [END storage_upload_encrypted_file]
}
main(...process.argv.slice(2));
