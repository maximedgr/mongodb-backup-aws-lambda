# Backup MongoDB (Atlas) to S3 through AWS Lambda Functions

Easily backup your MongoDB database hosted on MongoDB Atlas using mongodump binary, AWS Lambda functions and S3 buckets and slack webhook for notifications.

Adapted from [llangit/lambda-mongocluster-s3](https://github.com/llangit/lambda-mongocluster-s3) 🙏.

## Setup instructions

For a **MongoDB Atlas cluster database** backup, specify the URI command option like this:

`--uri "mongodb+srv://[user]:[pass]@[host]/[name]"`


`mongodump` binary is version 100.7.4 (mongodb-database-tools-amazon2-x86_64-100.7.4).

You can download the latest binary of mongodump here : [mongodb-database-tools](https://www.mongodb.com/try/download/database-tools). Be sure to download the version corresponding to your AWS Lambda configuration.

1. Clone and install dependencies : `npm i`
2. ZIP contents of the folder (not the folder itself), with the node_modules : in the main folder run : `zip -r ../backup_code_function.zip *`
3. Create an AWS Lambda function
   - Select 'Author from scratch', enter your function name and select `Node.js 18.x`
   - Choose an existing role or create a new one and make sure it has a policy with `s3:PutObject` and `s3:ListBucket` permissions for the S3 bucket that you want to back up to, as well as the `AWSLambdaBasicExecutionRole` policy
   - Upload the ZIP file
   - Under the Configuration tab, set the environment variables (see table below) and increase the timeout (e.g. 1min), ephemeral storage (e.g. 1024 MB) and memory (e.g. 512 MB) (depending on the size of your database, you may need to adjust these settings)
   - Configure a trigger. For instance, with EventBridge you can set up a cron schedule : example `cron(0 * * * ? *)` will trigger a backup every hour.
4. Give your AWS Lambda function access to the internet and MongoDB Atlas

To allow your Lambda function to connect to MongoDB Atlas, you need to provide it with internet access. To do this, associate a VPC with your function.
Here is a great tutorial covering the steps: [https://www.youtube.com/watch?v=Z3dMhPxbuG0](https://www.youtube.com/watch?v=Z3dMhPxbuG0)

**Steps:**

1. **Go to AWS VPC:** Then click the "Create VPC" button.
2. **Specify VPC details:**
   - Name your VPC.
   - Choose an Availability Zone (one is sufficient to start with).
   - Ensure you create both a private subnet and a public subnet, as well as a NAT gateway.
3. **Create a Security Group:** Once the VPC is created, create a security group and enable HTTP, HTTPS, and port 27017.
4. **Associate Elastic IP:** It is recommended to associate an elastic IP with your NAT gateway to whitelist it within your MongoDB Atlas configuration.
   - **Note:** There are two ways to whitelist: you can either whitelist the IP associated with your NAT gateway in MongoDB Atlas as you would for a computer's IP, or you can use the peering feature. Note that MongoDB Atlas restricts peering based on your cluster tier.
   - **Note:** You can associate multiple Lambda functions within the same VPC. The ENVIRONMENT environment variable will help you distinguish between multiple functions running and using the same Slack webhook.

5. Test it !

## Notifications:

A useful feature is receiving notifications to know if your backup was successfully executed. To do this, go to [Slack](https://api.slack.com/messaging/webhooks) and create a webhook associated with your workspace in a dedicated channel.
A notification will be sent each time a backup request is triggered, informing you of its execution status.
   - **Note:** The ENVIRONMENT environment variable will help you distinguish between multiple functions running and using the same Slack webhook.


## Environment variables

| Variable           | Description                                                                                                                                                                            | Required?                    |
|--------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------|
| MONGODUMP_OPTIONS  | Your mongodump command options separated by a space (without `mongodump` at the beginning), for instance `--uri "mongodb+srv://[user]:[pass]@[host]/[name]"`. Refer to the [mongodump docs](https://docs.mongodb.com/database-tools/mongodump/) for a list of available options. Important: do not include the `--out` or `-o` option. | Yes                          |
| S3_BUCKET          | Name of the S3 bucket                                                                                                                                                                  | Yes                          |
| S3_STORAGE_CLASS   | S3 storage class for the backup. Refer to the [S3 SDK docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html) for a list of available options.                          | No. Default is `STANDARD`    |
| ZIP_FILENAME       | Name of the ZIP archive                                                                                                                                                                | No. Default is `mongodb_backup` |
| FOLDER_PREFIX      | Name of the Parent folder                                                                                                                                                              | No. Default is `mongodb_backups` |
| DATE_FORMAT        | Will be appended to `ZIP_FILENAME` with a `_` separator. Refer to the [DayJS docs](https://day.js.org/docs/en/display/format) for a list of available formatting options.                | No. Default is `YYYYMMDD_HHmmss` |
| ENVIRONMENT        | Specify your app environment for custom Slack notifications                                                                                                                            | No. Default is `unknown`     |
| SLACK_WEBHOOK_URL  | Your Slack webhook URL                                                                                                                                                                 | No                           |
| BACKUPS_TO_RETAIN  | Number of backups to retain in S3. Older backups will be deleted.                                                                                                                       | No. Default is `10`          |

## Et voila ! 

And there you have it, you have just created your own backup system for your MongoDB database using AWS services. I strongly encourage you to deploy this system yourself instead of relying on subscription-based services or applications, as you will save money in the long run. Remember that AWS is a paid service, but with the free tier, you can get many operations free of charge each month. Be sure to monitor your credit usage.


## Ideas 

- Improve connection management with MongoDB using the Mongoose library
- Log management  

Feel free to contribute ! 