'use strict';

const util = require('node:util');
const exec = util.promisify(require('node:child_process').exec);
const AWS = require('aws-sdk');
const AdmZip = require('adm-zip');
const dayjs = require('dayjs');
const axios = require('axios');

// ENVIRONMENT VARIABLES
const dumpOptions = process.env.MONGODUMP_OPTIONS;
const bucketName = process.env.S3_BUCKET;
const s3bucket = new AWS.S3({ params: { Bucket: bucketName } });
const s3StorageClass = process.env.S3_STORAGE_CLASS || 'STANDARD';
const zipFilename = process.env.ZIP_FILENAME || 'mongodb_backup';
const folderPrefix = process.env.FOLDER_PREFIX || 'mongodb_backups';
const dateFormat = process.env.DATE_FORMAT || 'YYYYMMDD_HHmmss';
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL; 
const environment = process.env.ENVIRONMENT || 'unknown';
const backupsToRetain = parseInt(process.env.BACKUPS_TO_RETAIN) || 10;

// Function to send notifications to Slack
const notifySlack = async (message) => {
  if (!slackWebhookUrl) {
    console.warn('Slack webhook URL is not set');
    return;
  }

  try {
    await axios.post(slackWebhookUrl, { text: `[${environment.toUpperCase()}] ${message}` });
  } catch (err) {
    console.error('Failed to send Slack notification:', err);
  }
};

// Backup process

exports.handler = async function (_event, _context) {
  console.info(`[${environment.toUpperCase()}] MongoDB backup to S3 bucket '${bucketName}' is starting`);

  process.env['PATH'] = process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT'];

  const fileName = zipFilename + '_' + dayjs().format(dateFormat);
  const folderName = `/tmp/${fileName}/`;
  let zipBuffer = null;

  try {
    console.info(`[${environment.toUpperCase()}] Creating directory: ${folderName}`);
    await exec(`mkdir -p ${folderName}`);
  } catch (err) {
    console.error(`[${environment.toUpperCase()}] Failed to create directory ${folderName}`, err);
    await notifySlack(`Failed to create directory ${folderName}: ${err.message}`);
    throw new Error(`Failed to create directory ${folderName}: ${err.message}`);
  }

  try {
    console.info(`[${environment.toUpperCase()}] Executing mongodump with options: ${dumpOptions}`);
    const { stdout, stderr } = await exec(`mongodump ${dumpOptions} --out ${folderName}`);
    console.info(`[${environment.toUpperCase()}] mongodump stdout:`, stdout);
    console.error(`[${environment.toUpperCase()}] mongodump stderr:`, stderr);
  } catch (err) {
    console.error(`[${environment.toUpperCase()}] mongodump command failed:`, err);
    await notifySlack(`mongodump command failed: ${err.message}`);
    throw new Error(`mongodump command failed: ${err.message}`);
  }

  try {
    console.info(`[${environment.toUpperCase()}] Creating ZIP archive from folder: ${folderName}`);
    const zip = new AdmZip();
    zip.addLocalFolder(folderName);
    zipBuffer = zip.toBuffer();
  } catch (err) {
    console.error(`[${environment.toUpperCase()}] Archive creation failed:`, err);
    await notifySlack(`Archive creation failed: ${err.message}`);
    throw new Error(`Archive creation failed: ${err.message}`);
  }

  try {
    console.info(`[${environment.toUpperCase()}] Uploading ZIP archive to S3 bucket: ${bucketName}, Key: ${folderPrefix}/${fileName}.zip`);
    await s3bucket.upload({
      Key: `${folderPrefix}/${fileName}.zip`,
      Body: zipBuffer,
      ContentType: 'application/zip',
      ServerSideEncryption: 'AES256',
      StorageClass: s3StorageClass
    }).promise();
  } catch (err) {
    console.error(`[${environment.toUpperCase()}] Upload to S3 failed:`, err);
    await notifySlack(`Upload to S3 failed: ${err.message}`);
    throw new Error(`Upload to S3 failed: ${err.message}`);
  }

  try {
    console.info(`[${environment.toUpperCase()}] Listing objects in S3 bucket: ${bucketName}, Prefix: ${folderPrefix}/`);
    const listedObjects = await s3bucket.listObjectsV2({
      Bucket: bucketName,
      Prefix: folderPrefix + '/'
    }).promise();

    const sortedObjects = listedObjects.Contents.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
    const objectsToDelete = sortedObjects.slice(backupsToRetain);

    if (objectsToDelete.length > 0) {
      console.info(`[${environment.toUpperCase()}] Deleting ${objectsToDelete.length} old backups from S3 bucket: ${bucketName}`);
      await s3bucket.deleteObjects({
        Bucket: bucketName,
        Delete: {
          Objects: objectsToDelete.map(obj => ({ Key: obj.Key }))
        }
      }).promise();
    } else {
      console.info(`[${environment.toUpperCase()}] No old backups to delete.`);
    }
  } catch (err) {
    console.error(`[${environment.toUpperCase()}] Failed to list or delete old backups:`, err);
    await notifySlack(`Failed to list or delete old backups: ${err.message}`);
    throw new Error(`Failed to list or delete old backups: ${err.message}`);
  }

  console.info(`[${environment.toUpperCase()}] Backup completed successfully`);
  await notifySlack('Backup completed successfully');
};