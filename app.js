'use strict';

// API credentials

const storj = require('storj-lib');
const fs = require('fs');

// Set the bridge api URL
const api = 'https://api.storj.io';

const concurrency = 6;

// Create client for interacting with API
let client = storj.BridgeClient(api, {
	keyPair: fs.readFileSync('./private.key').toString() || '',
	concurrency: concurrency
});

// Create a new Storj user from email and password
function createUser(email, password) {
	return new Promise((resolve, reject) => {

		// Create User
		client.createUser({
			email: email,
			password: password
		}, err => {
			if (err) {
				// Handle error on failure.
				console.error('Error creating user', err.message);
				return reject(err);
			}

			// Check email for confirmation link
			console.log('user created!');
			return resolve();
		});
	});
}

// Generate and save a key pair
function createKeyPair(email, password) {
	return new Promise((resolve, reject) => {
		const client = storj.BridgeClient(api, { basicAuth: { email: email, password: password } });

		// Generate KeyPair
		const keyPair = storj.KeyPair();

		// Add the keypair public key to the user account for authentication
		client.addPublicKey(keyPair.getPublicKey(), function (err) {
			if (err) {
				// Handle error on failure.
				console.log('Error adding public key', err.message);
				return reject(err);
			}

			// Save the private key for using to login later.
			// TODO You should probably encrypt this
			fs.writeFileSync('./private.key', keyPair.getPrivateKey());
			return resolve();
		});
	});
}

// TODO take key path as input?
function authenticateWithKeyPair() {

	// Load keypair from your saved private key
	const keyPair = storj.KeyPair(fs.readFileSync('./private.key').toString());

	// Login using the keypair generated
	client = storj.BridgeClient(api, { keyPair: keyPair });
	return client;
}

function listKeys() {
	if (!client) return new Error('No client provided');

	return new Promise((resolve, reject) => {
		client.getPublicKeys((err, keys) => {
			if (err) {
				console.log('Error listing clients', err.message);
				return reject(err);
			} else if (keys) {

				// print out each key
				keys.forEach(key => {
					console.log('info', key.key);
				});
				return resolve(keys);
			} else return reject(new Error('No keys found'));
		});
	});
}

function listBuckets() {
	if (!client) return new Error('No client provided');

	return new Promise((resolve, reject) => {
		client.getBuckets((err, buckets) => {
			if (err) {
				console.log('Error listing buckets', err.message);
				return reject(err);
			}

			if (!buckets.length) {
				console.log('warn', 'You have not created any buckets');
				return reject('You have not created any buckets');
			}

			// Log out info for each bucket
			buckets.forEach(bucket => {
				console.log(
					'info',
					`ID: ${bucket.id}, Name: ${bucket.name}, Storage: ${bucket.storage}, Transfer: ${bucket.transfer}`
				);
			});

			return resolve(buckets);
		});
	});
}


function addBucket(bucketInfo) {
	if (!bucketInfo) return new Error('No bucketInfo provided');

	return new Promise((resolve, reject) => {

		// Add bucket
		client.createBucket(bucketInfo, (err, bucket) => {
			if (err) {
				console.log(`Error creating bucket ${bucketInfo.name}`, err.message);
				return reject(err);
			}

			// Log out bucket info
			console.log(
				'info',
				`Added bucket ID: ${bucket.id}, Name: ${bucket.name}, Storage: ${bucket.storage}, Transfer: ${bucket.transfer}`
			);

			return resolve(bucket);
		});
	});
}

function removeBucket(bucketId) {
	if (!bucketId) return new Error('No bucketId provided');

	return new Promise((resolve, reject) => {

		// Remove bucket by id
		client.destroyBucketById(bucketId, err => {
			if (err) {
				console.log(`Error removing bucket ${bucketInfo.name}`, err.message);
				return reject(err);
			}

			console.log('info', 'Bucket successfully destroyed');
			return resolve();
		});
	});
}

function addKey(keyPair) {
	if (!keyPair || !keyPair.getPublicKey()) return new Error('Invalid keyPair provided');

	return new Promise((resolve, reject) => {

		// Add Public Key
		client.addPublicKey(keyPair.getPublicKey(), err => {
			if (err) {
				console.log('Error adding key pair', err.message);
				return reject(err);
			}

			console.log('Succesfully added public key')
			return resolve();
		});
	});
}

function removeKeyPair(keyPair) {
	if (!keyPair || !keyPair.getPublicKey()) return new Error('Invalid keyPair provided');

	return new Promise((resolve, reject) => {

		// Remove Public Key that was just added
		client.destroyPublicKey(keyPair.getPublicKey(), function (err) {
			if (err) {
				console.log('Error removing key pair', err.message);
				return reject(err);
			}

			console.log('info', 'Key successfully revoked');
			return resolve();
		});
	});
}

function uploadFile(bucketId, filePath) {
	// if (!bucketId || !filePath) return new Error('Missing bucketId or filePath');

	return new Promise((resolve, reject) => {

		// Bucket being uploaded to
		const bucket = bucketId || '194128b5cb3d17f1b6e51397';

		// File to be uploaded
		const filepath = filePath || 'dummy_file.txt';

		// Path to temporarily store encrypted version of file to be uploaded
		const tmppath = './temp/' + filepath + '.crypt';

		// Key ring to hold key used to interact with uploaded file
		const keyring = storj.KeyRing('./', 'keypass');

		// Prepare to encrypt file for upload
		const secret = new storj.DataCipherKeyIv();
		const encrypter = new storj.EncryptStream(secret);

		//Encrypt the file to be uploaded and store it temporarily
		fs.createReadStream(filepath)
			.pipe(encrypter)
			.pipe(fs.createWriteStream(tmppath)).on('finish', () => {

			console.log(`Finished writing file to ${tmppath}`);

			// Create token for uploading to bucket by bucketid
			client.createToken(bucket, 'PUSH', (err, token) => {
				if (err) {
					console.log('error', err.message);
					return reject(err);
				}

				console.log(`Fetched token from bucket ${JSON.stringify(token)}`);

				// Store the file using the bucket id, token, and encrypted file
				client.storeFileInBucket(bucket, token.token, tmppath, (err, file) => {
					if (err) {
						console.log('error', err.message);
						return reject(err);
					}

					console.log('File stored in bucket');
					console.log(JSON.stringify(file));

					// Save key for access to download file
					keyring.set(file.id, secret);

					console.log(
						'info',
						'Name: %s, Type: %s, Size: %s bytes, ID: %s',
						[file.filename, file.mimetype, file.size, file.id]
					);

					return resolve(file);
				});
			});
		});
	});
}

authenticateWithKeyPair()
listKeys().then(() => {
	// Generate KeyPair
	const keypair = storj.KeyPair();
	addKey(keypair).then(() => {
		listKeys().then(() => {
			removeKeyPair(keypair).then(() => {
				listKeys().then(() => {
					listBuckets().then(() => {
						addBucket({ name: 'TestBucket' }).then(bucket => {
							listBuckets().then(() => {
								removeBucket(bucket.id).then(() => {
									listBuckets().then(() => {
										uploadFile();
									});
								});
							});
						})
					});
				});
			});
		});
	});
});



